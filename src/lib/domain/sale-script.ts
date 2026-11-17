// Penyimpanan penjualan all-or-nothing + idempotensi (BAGIAN 17.2).
// KEYS: [1]=idempotency, [2]=sequence, [3]=sales index (zset), [4]=movements index (zset),
//       [5..4+n]=kunci inventaris
// ARGV: [1]=timestamp(ms), [2]=prefix sales, [3]=JSON sale dgn token __ID__/__NUMBER__,
//       [4]=prefix movements, [5..4+n]=jumlah dibutuhkan, [5+n..4+2n]=itemId
export const SAVE_SALE_LUA = `
local existing = redis.call('GET', KEYS[1])
if existing then return cjson.encode({status='duplicate', saleId=existing}) end
local n = #KEYS - 4
for i = 1, n do
  local cur = tonumber(redis.call('GET', KEYS[4 + i]) or '0') or 0
  local need = tonumber(ARGV[4 + i])
  if cur < need then
    return cjson.encode({status='insufficient', itemId=ARGV[4 + n + i], have=cur, need=need})
  end
end
local seq = redis.call('INCR', KEYS[2])
local number = 'TRX' .. string.format('%06d', seq)
local saleId = ARGV[2] .. seq
local json = string.gsub(ARGV[3], '__ID__', tostring(seq))
json = string.gsub(json, '__NUMBER__', number)
redis.call('SET', saleId, json)
redis.call('ZADD', KEYS[3], ARGV[1], saleId)
for i = 1, n do
  local need = tonumber(ARGV[4 + i])
  local after = redis.call('DECRBY', KEYS[4 + i], need)
  local mid = ARGV[4] .. seq .. ':' .. i
  redis.call('SET', mid, cjson.encode({
    id = mid, itemId = ARGV[4 + n + i], type = 'penjualan', qtyOut = need,
    qtyIn = 0, stockAfter = after, ref = number, saleId = saleId, ts = tonumber(ARGV[1])
  }))
  redis.call('ZADD', KEYS[4], ARGV[1], mid)
end
redis.call('SET', KEYS[1], saleId, 'EX', 86400)
return cjson.encode({status='ok', saleId=saleId, number=number})
`;
