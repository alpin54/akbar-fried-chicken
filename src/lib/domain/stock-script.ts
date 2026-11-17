// Perubahan stok atomik generik (pembelian, penyesuaian). All-or-nothing + idempotensi.
// KEYS: [1]=idempotency, [2]=sequence, [3]=record index (zset), [4]=movements index (zset),
//       [5..4+n]=kunci inventaris (n boleh 0)
// ARGV: [1]=ts, [2]=prefix record, [3]=JSON record dgn token __ID__/__NUMBER__,
//       [4]=prefix movement, [5]=prefix nomor, [6]=jenis gerakan, [7]=keterangan,
//       [8..7+n]=delta (negatif = keluar), [8+n..7+2n]=itemId
export const APPLY_STOCK_LUA = `
local existing = redis.call('GET', KEYS[1])
if existing then return cjson.encode({status='duplicate', recordId=existing}) end
local n = #KEYS - 4
for i = 1, n do
  local d = tonumber(ARGV[7 + i])
  if d < 0 then
    local cur = tonumber(redis.call('GET', KEYS[4 + i]) or '0') or 0
    if cur + d < 0 then
      return cjson.encode({status='insufficient', itemId=ARGV[7 + n + i], have=cur, need=-d})
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
  local d = tonumber(ARGV[7 + i])
  local after = redis.call('INCRBY', KEYS[4 + i], ARGV[7 + i])
  local mid = ARGV[4] .. number .. ':' .. i
  local qin = 0
  local qout = 0
  if d > 0 then qin = d else qout = -d end
  redis.call('SET', mid, cjson.encode({
    id = mid, itemId = ARGV[7 + n + i], type = ARGV[6], qtyIn = qin, qtyOut = qout,
    stockAfter = after, ref = number, note = ARGV[7], recordId = recordKey, ts = tonumber(ARGV[1])
  }))
  redis.call('ZADD', KEYS[4], ARGV[1], mid)
end
redis.call('SET', KEYS[1], recordKey, 'EX', 86400)
return cjson.encode({status='ok', recordId=recordKey, number=number})
`;
