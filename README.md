# Fried Chicken Management System

Aplikasi manajemen outlet: kasir (POS), pembelian, stok bahan baku, pengeluaran, dan laporan.
Next.js (App Router) + TypeScript + Tailwind (fondasi TailAdmin) + Upstash Redis.

## Menjalankan di komputer

Butuh Node.js 22.18 atau lebih baru (tes TypeScript berjalan langsung di Node tanpa flag tambahan).

1. `npm install`
2. Salin `.env.example` menjadi `.env.local`, lalu isi nilainya (lihat tabel di bawah).
3. `npm run dev`, buka http://localhost:3000, masuk dengan `ADMIN_USERNAME` dan `ADMIN_INITIAL_PASSWORD`.
4. Sebelum dipakai: `npm run lint`, `npx tsc --noEmit`, `npm run build`, dan `npm test`.

## Environment variable

| Nama | Keterangan |
|---|---|
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Dari dashboard Upstash (database Redis) |
| `SESSION_SECRET` | Teks acak panjang (cadangan untuk pengembangan lanjutan) |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_INITIAL_PASSWORD` | Akun admin pertama, dibuat otomatis saat login pertama bila belum ada. Ganti password lewat Pengaturan Akun. |
| `NEXT_PUBLIC_APP_NAME` | Nama aplikasi |
| `APP_TIMEZONE` | Opsional, default `Asia/Jakarta` (dipakai untuk batas tanggal laporan) |

Jangan commit `.env.local`.

## Deploy ke Vercel

1. Unggah proyek ke GitHub, lalu Import di Vercel (framework Next.js terdeteksi otomatis).
2. Isi semua environment variable di atas pada Project Settings, Environment Variables.
3. Deploy. Tidak ada penyimpanan file lokal; seluruh data ada di Upstash Redis.

## Setelah Redis dikosongkan (inisialisasi ulang)

1. Kosongkan database Upstash dari dashboard Upstash (jangan lewat aplikasi).
2. Jalankan ulang aplikasi (`npm run dev` / `npm run start`, atau Redeploy di Vercel).
3. Saat server start, `src/instrumentation.ts` otomatis menjalankan bootstrap di server: membuat 3 kategori
   (Paket, Tambahan, Fried Chicken), 12 produk, satuan, inventori (Dada, Paha Atas, Paha Bawah, Sayap, Sambal; stok 0),
   aturan potongan default (4/2/2/2), resep sambal default (1 per porsi), dan akun admin dari `ADMIN_*`.
   Seeder idempotent: hanya membuat yang belum ada, tidak menimpa harga/produk yang sudah diedit, tidak membuat duplikat.
   Penanda `meta:seed_version` baru ditulis setelah seluruh data awal berhasil dibuat.
4. Cek kesiapan: buka `/api/health` (harus `{"ok":true}`). Bila Redis bermasalah, pesan error jelas muncul di sana,
   di halaman login, dan di log server; inisialisasi dicoba lagi pada permintaan berikutnya.
5. Masuk, lalu isi stok lewat Pembelian, Beli Ayam (dan Stok Barang untuk sambal).

Produk awal: Paket (Ayam + Nasi Rp15.000, Ayam Geprek Rp12.000, Ayam Geprek + Nasi Rp18.000), Tambahan (Nasi Rp4.000,
Sambal Rp3.000), Fried Chicken (Dada Rp9.000, Paha Atas Rp9.000, Paha Bawah Rp8.000, Sayap Rp9.000, Ati Ampela Rp4.000,
Kepala Rp3.000, Ceker Rp2.000).

## Aturan stok

- Setiap produk punya pilihan **Manajemen Stok: Dengan Stok / Tanpa Stok** (`trackStock`, divalidasi di server).
  Dengan Stok: punya inventori (ID inventori = ID produk), muncul di Stok Barang, punya minimum, status, dan riwayat, serta
  penjualannya memeriksa stok. Tanpa Stok: tidak ada inventori baru, tidak muncul di Stok Barang, penjualan tidak mengubah stok.
- Default: Dada, Paha Atas, Paha Bawah, Sayap, Ati Ampela, Kepala, Ceker, Sambal = Dengan Stok. Nasi dan paket = Tanpa Stok.
  Nasi tidak pernah punya stok (ditolak di server). Paket tidak bisa Dengan Stok; bahan bakunya dikurangi lewat komposisi.
- Mengubah Dengan Stok menjadi Tanpa Stok butuh konfirmasi bila ada saldo/riwayat; saldo dan riwayat tetap tersimpan.
  Mengubah Tanpa Stok menjadi Dengan Stok membuat inventori awal 0 bila belum ada. Transaksi lama tidak berubah (snapshot).
- Paket ayam (Ayam + Nasi / Ayam Geprek / Ayam Geprek + Nasi): kasir wajib memilih bagian; hanya bagian itu yang berkurang. Geprek juga mengurangi sambal.
- Penjualan satuan produk Dengan Stok (Dada, ..., Ati Ampela, Kepala, Ceker, Sambal) mengurangi stoknya sendiri.
- Pembelian ayam utuh hanya menambah Dada, Paha Atas, Paha Bawah, Sayap (jumlah EKOR x aturan per ekor; KG hanya biaya).
  Aturan potongan per ekor bisa diubah langsung di form Beli Ayam (khusus pembelian itu, dengan preview langsung); aturan default global
  (Pengaturan, Aturan Potongan Ayam) hanya menjadi nilai awal form dan tidak berubah. Aturan yang dipakai disimpan sebagai snapshot
  (`chickenCount`, `cuttingRule`, `convertedStock`, `totalPieces`, `ruleSource`) dan dipakai untuk reversal.
  Ati Ampela, Kepala, Ceker masuk lewat Pembelian, Beli Barang Lain (pilih produknya) atau Sesuaikan stok.

## Atomicity, idempotency, concurrency

- Semua mutasi stok memakai script Lua atomik (`src/lib/domain/stock-script.ts`): seluruh validasi sebelum penulisan pertama,
  jadi all-or-nothing, tanpa stok negatif, dan dua kasir yang berebut stok tidak bisa sama-sama berhasil.
- Idempotency: setiap permintaan mutasi membawa `Idempotency-Key` (UUID dari client). Server menyimpan `hash(payload)|transaksi`.
  Key sama + payload sama mengembalikan transaksi lama; key sama + payload beda ditolak (409). Catatan idempotency tidak kedaluwarsa.
  Status PROCESSING tidak pernah terlihat karena script tidak bisa disela; kegagalan (mis. stok kurang) tidak menyimpan apa pun sehingga aman dicoba lagi.
- Pembatalan penjualan/pembelian: reversal atomik, hanya sekali, movement asal tidak diubah, movement reversal mengacu ke movement asal.
  Pembatalan pembelian ditolak bila stoknya sudah terpakai.
- Catatan: Redis tidak me-rollback script yang error di tengah. Script dirancang tanpa validasi setelah penulisan dimulai.
- Perubahan non-transaksi (edit/hapus pengeluaran, produk, pengaturan) bersifat PUT/DELETE yang aman diulang, tanpa idempotency key.

## Pengujian

`npm test` menjalankan semua tes di `tests/`: aturan bisnis, seeder (Redis tiruan), dan script Lua ASLI di Redis tiruan.
Tes script Lua memakai `python3` + `liblua5.4` (`tests/lua/harness.py`); bila tidak ada, tes itu dilewati.
Tes ini TIDAK menggantikan uji pada Upstash sungguhan (Lua 5.1 di Redis vs 5.4 di harness).

## Aturan penting

- Nasi tidak punya stok, tidak masuk Stok Barang, dan tidak menghasilkan riwayat stok.
- Harga dan resep disimpan sebagai snapshot di setiap transaksi; perubahan hanya berlaku untuk transaksi baru.
- Penjualan, pembelian, dan penyesuaian stok berjalan atomik (skrip Lua) dengan idempotency key; stok tidak bisa negatif.
- Pembatalan penjualan tidak menghapus transaksi; stok dikembalikan dan dicatat.
- Selisih di Laporan Keuangan adalah selisih kas, bukan laba bersih akuntansi (HPP belum dihitung).

## Struktur data Redis (prefix `friedchicken:v1:`)

`users`, `sessions`, `products(+index, categoryId)`, `categories(+index)`, `units(+index)`, `meta:seed_version`, `inventory` (angka stok mentah), `inventory_meta`,
`sales`, `sales_cancel`, `purchases`, `adjustments`, `expenses`, `stock_movements(+index)`,
`settings:{sale_recipe,conversion_recipe,outlet}`, `activity_logs`, `sequences`, `idempotency`.

## Pengujian

Logika bisnis murni diuji di `tests/` (aturan penjualan A–E, pembelian, laporan, password).
Skrip Lua dan antarmuka perlu diuji manual pada Redis dan browser sungguhan.
