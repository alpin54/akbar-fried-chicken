"use client";

import { Chart } from "@/components/shared/chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { apiGet, fmtDate, fmtDateTime } from "@/lib/client";
import { Link } from "@/i18n/navigation";
import { formatRupiah } from "@/lib/money";
import { useEffect, useState } from "react";

type Dash = {
  today: string;
  cards: { sales: number; transactions: number; purchases: number; expenses: number; net: number; lowStock: number; lowStockNames: string[] };
  daily: { date: string; sales: number; transactions: number; purchases: number; expenses: number }[];
  products: { name: string; quantity: number; revenue: number }[];
  recentSales: { id: string; number: string; createdAt: number; total: number; status: string }[];
};

const short = (iso: string) => fmtDate(iso).replace(/\s\d{4}$/, "");

export default function Dashboard() {
  const [d, setD] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<7 | 30>(7);

  useEffect(() => {
    apiGet<Dash>("/api/dashboard").then(setD).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!d) return <p className="text-sm text-gray-500">Memuat dashboard...</p>;

  const days = d.daily.slice(-range);
  const c = d.cards;
  const cards = [
    { label: "Penjualan Hari Ini", value: formatRupiah(c.sales) },
    { label: "Transaksi Hari Ini", value: String(c.transactions) },
    { label: "Pembelian Hari Ini", value: formatRupiah(c.purchases) },
    { label: "Pengeluaran Hari Ini", value: formatRupiah(c.expenses) },
    { label: "Selisih Hari Ini", value: formatRupiah(c.net), hint: "Penjualan dikurangi pembelian dan pengeluaran (kas, bukan laba akuntansi)", tone: c.net < 0 ? "text-red-600" : "" },
    { label: "Stok Menipis / Habis", value: `${c.lowStock} barang`, hint: c.lowStockNames.join(", ") },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Dashboard</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { href: "/penjualan/tambah", label: "Penjualan Baru", primary: true },
          { href: "/pembelian", label: "Pembelian" },
          { href: "/pengeluaran", label: "Tambah Pengeluaran" },
          { href: "/stok", label: "Stok Barang" },
        ].map((a) => (
          <Link key={a.href} href={a.href}>
            <Button size="lg" variant={a.primary ? "default" : "outline"} className="h-16 w-full text-base">{a.label}</Button>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map((x) => (
          <div key={x.label} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <p className="text-sm text-gray-500">{x.label}</p>
            <p className={`mt-1 text-2xl font-bold text-gray-900 dark:text-white ${x.tone ?? ""}`}>{x.value}</p>
            {x.hint && <p className="mt-1 text-xs text-gray-500">{x.hint}</p>}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {([7, 30] as const).map((n) => (
          <Button key={n} size="sm" variant={range === n ? "default" : "outline"} onClick={() => setRange(n)}>{n} Hari Terakhir</Button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={`Penjualan ${range} Hari Terakhir`}>
          <Chart type="area" categories={days.map((x) => short(x.date))} series={[{ name: "Penjualan", data: days.map((x) => x.sales) }]} />
        </Panel>
        <Panel title="Pemasukan dan Pengeluaran">
          <Chart type="bar" categories={days.map((x) => short(x.date))} colors={["#16A34A", "#E71201"]}
            series={[{ name: "Pemasukan", data: days.map((x) => x.sales) }, { name: "Pengeluaran", data: days.map((x) => x.purchases + x.expenses) }]} />
        </Panel>
        <Panel title="Produk Paling Banyak Terjual (30 hari)">
          {d.products.length === 0 ? <p className="py-10 text-center text-sm text-gray-500">Belum ada penjualan.</p> :
            <Chart type="bar" horizontal money={false} height={260} categories={d.products.map((p) => p.name)} series={[{ name: "Terjual", data: d.products.map((p) => p.quantity) }]} />}
        </Panel>
        <Panel title="Transaksi Terbaru">
          {d.recentSales.length === 0 ? <p className="py-10 text-center text-sm text-gray-500">Belum ada transaksi.</p> : (
            <ul className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
              {d.recentSales.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <div><p className="font-medium">{s.number}</p><p className="text-xs text-gray-500">{fmtDateTime(s.createdAt)}</p></div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{formatRupiah(s.total)}</span>
                    <Badge color={s.status === "selesai" ? "success" : "error"} size="sm">{s.status === "selesai" ? "Selesai" : "Dibatalkan"}</Badge>
                    <Link href="/penjualan/riwayat"><Button size="xs" variant="outline">Detail</Button></Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="mb-3 font-semibold text-gray-800 dark:text-white/90">{title}</h2>
      {children}
    </section>
  );
}
