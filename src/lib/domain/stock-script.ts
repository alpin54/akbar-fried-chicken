// Mutasi stok atomik. SELURUH validasi dilakukan SEBELUM penulisan pertama, dan Redis menjalankan
// script secara serial: tidak ada request lain yang menyela. Hasilnya all-or-nothing.
// Catatan: Redis TIDAK me-rollback script yang error di tengah jalan; karena itu tidak ada validasi
// setelah penulisan dimulai. Idempotency disimpan sebagai "hash|recordKey" (status COMPLETED);
// status PROCESSING tidak pernah terlihat karena eksekusi script tidak dapat disela.
export type KeyFn = (...parts: (string | number)[]) => string;

// KEYS: [1]=idempotency, [2]=sequence, [3]=record index, [4]=movement index global,
//       [5..4+n]=kunci inventori, [5+n..4+2n]=index movement per barang
// ARGV: [1]=ts, [2]=prefix record, [3]=JSON record (token __ID__/__NUMBER__), [4]=prefix movement,
//       [5]=prefix nomor, [6]=jenis movement, [7]=catatan, [8]=hash payload, [9]=actor,
//       [9+i]=delta (negatif=keluar), [9+n+i]=ID barang
export const APPLY_STOCK_LUA = `
local n = math.floor((#KEYS - 4) / 2)
local B = 9
local idem = redis.call('GET', KEYS[1])
if idem then
  local sep = string.find(idem, '|', 1, true)
  if string.sub(idem, 1, sep - 1) ~= ARGV[8] then return cjson.encode({status='conflict'}) end
  return cjson.encode({status='duplicate', recordId=string.sub(idem, sep + 1)})
end
for i = 1, n do
  local ik = KEYS[4 + i]
  if redis.call('EXISTS', ik) == 0 then
    return cjson.encode({status='missing', itemId=ARGV[B + n + i]})
  end
  local d = tonumber(ARGV[B + i])
  if d < 0 then
    local cur = tonumber(redis.call('GET', ik))
    if cur + d < 0 then
      return cjson.encode({status='insufficient', itemId=ARGV[B + n + i], have=cur, need=-d})
    end
  end
end
local seq = redis.call('INCR', KEYS[2])
local number = ARGV[5] .. string.format('%06d', seq)
local recordKey = ARGV[2] .. seq
local json = string.gsub(ARGV[3], '__ID__', tostring(seq))
json = string.gsub(json, '__NUMBER__', number)
redis.call('SET', recordKey, json)
redis.call('ZADD', KEYS[3], ARGV[1], recordKey)
for i = 1, n do
  local ik = KEYS[4 + i]
  local d = tonumber(ARGV[B + i])
  local before = tonumber(redis.call('GET', ik))
  local after = redis.call('INCRBY', ik, ARGV[B + i])
  local item = ARGV[B + n + i]
  local mid = ARGV[4] .. number .. ':' .. item
  local qin = 0
  local qout = 0
  if d > 0 then qin = d else qout = -d end
  redis.call('SET', mid, cjson.encode({
    id = mid, itemId = item, productId = item, type = ARGV[6], qtyIn = qin, qtyOut = qout,
    balanceBefore = before, stockAfter = after, ref = number, transactionId = recordKey,
    note = ARGV[7], actorId = ARGV[9], ts = tonumber(ARGV[1])
  }))
  redis.call('ZADD', KEYS[4 + n + i], ARGV[1], mid)
  redis.call('ZADD', KEYS[4], ARGV[1], mid)
end
redis.call('SET', KEYS[1], ARGV[8] .. '|' .. recordKey)
return cjson.encode({status='ok', recordId=recordKey, number=number})
`;

// Reversal (pembatalan): catatan transaksi & movement asal TIDAK diubah. Hanya boleh sekali.
// KEYS: [1]=idempotency, [2]=catatan pembatalan, [3]=movement index global,
//       [4..3+n]=kunci inventori, [4+n..3+2n]=index movement per barang
// ARGV: [1]=ts, [2]=prefix movement, [3]=JSON pembatalan, [4]=nomor transaksi asal, [5]=alasan,
//       [6]=hash payload, [7]=actor, [8]=jenis movement, [9]=ID transaksi asal,
//       [9+i]=delta yang diterapkan, [9+n+i]=ID barang
export const REVERSE_STOCK_LUA = `
local n = math.floor((#KEYS - 3) / 2)
local B = 9
local idem = redis.call('GET', KEYS[1])
if idem then
  local sep = string.find(idem, '|', 1, true)
  if string.sub(idem, 1, sep - 1) ~= ARGV[6] then return cjson.encode({status='conflict'}) end
  return cjson.encode({status='duplicate'})
end
if redis.call('EXISTS', KEYS[2]) == 1 then return cjson.encode({status='already'}) end
for i = 1, n do
  local ik = KEYS[3 + i]
  if redis.call('EXISTS', ik) == 0 then
    return cjson.encode({status='unsafe', itemId=ARGV[B + n + i], have=0, need=0})
  end
  local d = tonumber(ARGV[B + i])
  if d < 0 then
    local cur = tonumber(redis.call('GET', ik))
    if cur + d < 0 then
      return cjson.encode({status='unsafe', itemId=ARGV[B + n + i], have=cur, need=-d})
    end
  end
end
redis.call('SET', KEYS[2], ARGV[3])
for i = 1, n do
  local ik = KEYS[3 + i]
  local d = tonumber(ARGV[B + i])
  local before = tonumber(redis.call('GET', ik))
  local after = redis.call('INCRBY', ik, ARGV[B + i])
  local item = ARGV[B + n + i]
  local mid = ARGV[2] .. 'REV-' .. ARGV[4] .. ':' .. item
  local qin = 0
  local qout = 0
  if d > 0 then qin = d else qout = -d end
  redis.call('SET', mid, cjson.encode({
    id = mid, itemId = item, productId = item, type = ARGV[8], qtyIn = qin, qtyOut = qout,
    balanceBefore = before, stockAfter = after, ref = ARGV[4], transactionId = ARGV[9],
    reversalOf = ARGV[2] .. ARGV[4] .. ':' .. item,
    note = ARGV[5], actorId = ARGV[7], ts = tonumber(ARGV[1])
  }))
  redis.call('ZADD', KEYS[3 + n + i], ARGV[1], mid)
  redis.call('ZADD', KEYS[3], ARGV[1], mid)
end
redis.call('SET', KEYS[1], ARGV[6] .. '|' .. ARGV[2] .. 'REV-' .. ARGV[4])
return cjson.encode({status='ok'})
`;

const entriesOf = (deltas: Record<string, number>) => Object.entries(deltas).filter(([, d]) => d !== 0);

export type ApplyParams = {
  k: KeyFn; idemKey: string; seqName: string; recordName: string; numberPrefix: string;
  record: object; type: string; note: string; payloadHash: string; actorId: string;
  deltas: Record<string, number>; now?: number;
};

export function buildApplyCall(p: ApplyParams): { keys: string[]; args: (string | number)[] } {
  const e = entriesOf(p.deltas);
  return {
    keys: [
      p.k("idempotency", p.recordName, p.idemKey), p.k("sequences", p.seqName),
      p.k(p.recordName + ":index"), p.k("stock_movements:index"),
      ...e.map(([id]) => p.k("inventory", id)),
      ...e.map(([id]) => p.k("stock_movements:item", id)),
    ],
    args: [
      p.now ?? Date.now(), p.k(p.recordName) + ":", JSON.stringify(p.record), p.k("stock_movements") + ":",
      p.numberPrefix, p.type, p.note, p.payloadHash, p.actorId,
      ...e.map(([, d]) => d), ...e.map(([id]) => id),
    ],
  };
}

export type ReverseParams = {
  k: KeyFn; idemKey: string; cancelKey: string; transactionNumber: string; transactionId: string;
  reason: string; payloadHash: string; actorId: string; type: string; cancel: object;
  deltas: Record<string, number>; now?: number;
};

export function buildReverseCall(p: ReverseParams): { keys: string[]; args: (string | number)[] } {
  const e = entriesOf(p.deltas);
  return {
    keys: [
      p.k("idempotency", "cancel", p.idemKey), p.cancelKey, p.k("stock_movements:index"),
      ...e.map(([id]) => p.k("inventory", id)),
      ...e.map(([id]) => p.k("stock_movements:item", id)),
    ],
    args: [
      p.now ?? Date.now(), p.k("stock_movements") + ":", JSON.stringify(p.cancel), p.transactionNumber,
      p.reason, p.payloadHash, p.actorId, p.type, p.transactionId,
      ...e.map(([, d]) => d), ...e.map(([id]) => id),
    ],
  };
}
