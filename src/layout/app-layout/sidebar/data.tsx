import {
  BoxIcon,
  BoxTappedIcon,
  CartIcon,
  DocIcon,
  DollarIcon,
  FolderIcon,
  FolderOpenIcon,
  LayoutGridIcon,
  ListIcon,
  PieChartIcon,
  TableIcon,
  TimeIcon,
  UserCircleIcon,
  BoltIcon,
} from "@/icons";
import type { NavSection } from "./types";

const ic = "size-6";

export const navSections: NavSection[] = [
  {
    type: "utama",
    label: "Utama",
    items: [
      { key: "dashboard", label: "Dashboard", path: "/", icon: <LayoutGridIcon className={ic} /> },
    ],
  },
  {
    type: "transaksi",
    label: "Transaksi",
    items: [
      // Menu Penjualan langsung membuka halaman Tambah Penjualan (kasir).
      { key: "penjualan", label: "Penjualan", path: "/penjualan/tambah", icon: <CartIcon className={ic} /> },
      { key: "riwayat-penjualan", label: "Riwayat Penjualan", path: "/penjualan/riwayat", icon: <TimeIcon className={ic} /> },
      { key: "pembelian", label: "Pembelian", path: "/pembelian", icon: <BoxIcon className={ic} /> },
      { key: "pengeluaran", label: "Pengeluaran", path: "/pengeluaran", icon: <DollarIcon className={ic} /> },
    ],
  },
  {
    type: "master",
    label: "Data Master",
    items: [
      { key: "produk", label: "Produk", path: "/produk", icon: <BoxTappedIcon className={ic} /> },
      { key: "kategori", label: "Kategori Produk", path: "/kategori", icon: <FolderIcon className={ic} /> },
      { key: "satuan", label: "Satuan", path: "/satuan", icon: <ListIcon className={ic} /> },
    ],
  },
  {
    type: "persediaan",
    label: "Persediaan",
    items: [
      { key: "stok", label: "Stok Barang", path: "/stok", icon: <TableIcon className={ic} /> },
      { key: "riwayat-stok", label: "Riwayat Stok", path: "/stok/riwayat", icon: <TimeIcon className={ic} /> },
    ],
  },
  {
    type: "laporan",
    label: "Laporan",
    items: [
      { key: "lap-penjualan", label: "Laporan Penjualan", path: "/laporan/penjualan", icon: <PieChartIcon className={ic} /> },
      { key: "lap-pembelian", label: "Laporan Pembelian", path: "/laporan/pembelian", icon: <DocIcon className={ic} /> },
      { key: "lap-pengeluaran", label: "Laporan Pengeluaran", path: "/laporan/pengeluaran", icon: <DocIcon className={ic} /> },
      { key: "lap-keuangan", label: "Laporan Keuangan", path: "/laporan/keuangan", icon: <DollarIcon className={ic} /> },
    ],
  },
  {
    type: "pengaturan",
    label: "Pengaturan",
    items: [
      { key: "outlet", label: "Pengaturan Outlet", path: "/pengaturan/outlet", icon: <FolderOpenIcon className={ic} /> },
      { key: "potongan", label: "Aturan Potongan Ayam", path: "/pengaturan/aturan-potongan", icon: <BoxIcon className={ic} /> },
      { key: "resep", label: "Pengaturan Resep", path: "/pengaturan/resep", icon: <BoltIcon className={ic} /> },
      { key: "akun", label: "Pengaturan Akun", path: "/pengaturan/akun", icon: <UserCircleIcon className={ic} /> },
    ],
  },
];
