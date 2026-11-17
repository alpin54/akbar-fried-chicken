# Fried Chicken Management System

Aplikasi manajemen outlet: kasir (POS), pembelian, stok bahan baku, pengeluaran, dan laporan.
Next.js (App Router) + TypeScript + Tailwind (fondasi TailAdmin) + Upstash Redis.

## Menjalankan di komputer

1. `npm install`
2. Salin `.env.example` menjadi `.env.local`, lalu isi nilainya (lihat tabel di bawah).
3. `npm run dev`, buka http://localhost:3000, masuk dengan `ADMIN_USERNAME` dan `ADMIN_INITIAL_PASSWORD`.
4. Sebelum dipakai: `npm run lint`, `npx tsc --noEmit`, `npm run build`, dan `node --experimental-strip-types --test tests/*.test.ts`.

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

- ID inventori = ID produk. Hanya `dada`, `paha_atas`, `paha_bawah`, `sayap` (hasil konversi ayam) dan `sambal` yang punya stok.
- Ayam + Nasi / Ayam Geprek / Ayam Geprek + Nasi: kasir wajib memilih bagian ayam; hanya bagian itu yang berkurang. Geprek juga mengurangi sambal sesuai resep.
- Produk satuan (Dada, Paha Atas, Paha Bawah, Sayap, Sambal) mengurangi stoknya sendiri; Ati Ampela, Kepala, Ceker tidak punya stok.
- Nasi tidak pernah punya stok, inventori, maupun riwayat stok.
- Pembelian ayam: potongan dihitung dari jumlah EKOR x aturan per ekor (Pengaturan, Aturan Potongan Ayam; hanya admin). KG hanya untuk biaya.
  Aturan yang dipakai disimpan sebagai snapshot di tiap pembelian.

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
