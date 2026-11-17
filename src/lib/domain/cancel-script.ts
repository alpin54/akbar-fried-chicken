// Pembatalan penjualan: catatan transaksi asli TIDAK diubah. Dibuat catatan pembatalan (NX = hanya sekali)
// lalu stok dikembalikan (reversal) dan dicatat di riwayat stok.
// KEYS: [1]=kunci pembatalan, [2]=index pergerakan (zset), [3..2+n]=kunci inventaris
// ARGV: [1]=ts, [2]=prefix movement, [3]=JSON catatan pembatalan, [4]=nomor transaksi, [5]=alasan,
//       [6..5+n]=jumlah dikembalikan, [6+n..5+2n]=itemId
export const CANCEL_SALE_LUA = `
local ok = redis.call('SET', KEYS[1], ARGV[3], 'NX')
if not ok then return cjson.encode({status='already'}) end
local n = #KEYS - 2
for i = 1, n do
  local after = redis.call('INCRBY', KEYS[2 + i], ARGV[5 + i])
  local mid = ARGV[2] .. 'batal:' .. ARGV[4] .. ':' .. i
  redis.call('SET', mid, cjson.encode({
    id = mid, itemId = ARGV[5 + n + i], type = 'pembatalan_penjualan',
    qtyIn = tonumber(ARGV[5 + i]), qtyOut = 0, stockAfter = after,
    ref = ARGV[4], note = ARGV[5], ts = tonumber(ARGV[1])
  }))
  redis.call('ZADD', KEYS[2], ARGV[1], mid)
end
return cjson.encode({status='ok'})
`;
