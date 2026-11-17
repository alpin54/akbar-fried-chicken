"use client";

import { Chart } from "@/components/shared/chart";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Notice } from "@/components/ui/notice";
import { downloadCsv, fmtDate } from "@/lib/client";
import { groupDaily, type Granularity } from "@/lib/domain/reports";
import { formatRupiah } from "@/lib/money";
import { useState } from "react";
import ReportShell, { Section, Stat } from "./report-shell";

const PART: Record<string, string> = { dada: "Dada", sayap: "Sayap", paha_atas: "Paha Atas", paha_bawah: "Paha Bawah" };
const G_LABEL: Record<Granularity, string> = { day: "Harian", week: "Mingguan", month: "Bulanan" };
const periodLabel = (g: Granularity, d: string) =>
  g === "month" ? new Date(d + "-01T00:00:00").toLocaleDateString("id-ID", { month: "long", year: "numeric" })
  : g === "week" ? `Minggu ${fmtDate(d)}` : fmtDate(d);

const CsvButton = ({ onClick }: { onClick: () => void }) => <Button variant="outline" onClick={onClick}>Unduh CSV</Button>;

export function SalesReport() {
  const [g, setG] = useState<Granularity>("day");
  return (
    <ReportShell title="Laporan Penjualan" actions={(d) => (
      <CsvButton onClick={() => downloadCsv(`laporan-penjualan-${d.report.from}_${d.report.to}.csv`,
        ["Periode", "Jumlah Transaksi", "Total Penjualan"],
        groupDaily(d.report.daily, g).map((r) => [r.date, r.transactions, r.sales]))} />
    )}>
      {({ report }) => {
        const rows = groupDaily(report.daily, g);
        const cols: Column<(typeof rows)[number]>[] = [
          { key: "p", header: "Periode", cell: (r) => periodLabel(g, r.date), sortValue: (r) => r.date },
          { key: "t", header: "Transaksi", align: "right", cell: (r) => r.transactions, sortValue: (r) => r.transactions },
          { key: "s", header: "Total Penjualan", align: "right", cell: (r) => formatRupiah(r.sales), sortValue: (r) => r.sales },
        ];
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Stat label="Total Penjualan" value={formatRupiah(report.summary.salesTotal)} />
              <Stat label="Jumlah Transaksi" value={String(report.summary.transactions)} />
              <Stat label="Transaksi Dibatalkan" value={String(report.summary.cancelled)} />
            </div>
            <div className="flex gap-2">
              {(Object.keys(G_LABEL) as Granularity[]).map((x) => (
                <Button key={x} size="sm" variant={g === x ? "default" : "outline"} onClick={() => setG(x)}>{G_LABEL[x]}</Button>
              ))}
            </div>
            <Chart type="bar" categories={rows.map((r) => (g === "month" ? r.date : r.date.slice(5)))} series={[{ name: "Penjualan", data: rows.map((r) => r.sales) }]} />
            <DataTable columns={cols} rows={rows} rowKey={(r) => r.date} pageSize={15} emptyText="Tidak ada data pada periode ini." />
            <Section title="Produk Terlaris">
              <DataTable pageSize={10} rows={report.products} rowKey={(r) => r.name} emptyText="Belum ada penjualan."
                columns={[
                  { key: "n", header: "Produk", cell: (r) => r.name },
                  { key: "q", header: "Terjual", align: "right", cell: (r) => r.quantity, sortValue: (r) => r.quantity },
                  { key: "r", header: "Pendapatan", align: "right", cell: (r) => formatRupiah(r.revenue), sortValue: (r) => r.revenue },
                ]} />
            </Section>
            <Section title="Varian Ayam Terjual">
              <DataTable pageSize={10} rows={report.variants} rowKey={(r) => r.variant} emptyText="Belum ada penjualan ayam."
                columns={[
                  { key: "v", header: "Bagian", cell: (r) => PART[r.variant] ?? r.variant },
                  { key: "q", header: "Terjual", align: "right", cell: (r) => r.quantity },
                ]} />
            </Section>
          </div>
        );
      }}
    </ReportShell>
  );
}

export function PurchaseReport() {
  return (
    <ReportShell title="Laporan Pembelian" actions={(d) => (
      <CsvButton onClick={() => downloadCsv(`laporan-pembelian-${d.report.from}_${d.report.to}.csv`,
        ["No", "Tanggal", "Jenis", "Rincian", "Supplier", "Total"],
        d.purchaseRows.map((p) => [p.number, p.date, p.kind === "ayam" ? "Ayam" : "Barang Lain",
          p.kind === "ayam" ? `${p.birds} ekor / ${p.weightKg} KG` : `${p.name} ${p.quantity} ${p.unit}`, p.supplier, p.total]))} />
    )}>
      {({ report, purchaseRows }) => (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat label="Total Pembelian" value={formatRupiah(report.summary.purchasesTotal)} />
            <Stat label="Pembelian Ayam" value={formatRupiah(report.summary.purchasesChicken)} />
            <Stat label="Pembelian Barang Lain" value={formatRupiah(report.summary.purchasesOther)} />
          </div>
          <Section title="Riwayat Pembelian">
            <DataTable rows={purchaseRows} rowKey={(r) => r.id} emptyText="Tidak ada pembelian pada periode ini."
              searchText={(r) => `${r.number} ${r.supplier} ${r.name ?? ""}`} searchPlaceholder="Cari pembelian..."
              columns={[
                { key: "n", header: "No", cell: (r) => r.number },
                { key: "d", header: "Tanggal", cell: (r) => fmtDate(r.date), sortValue: (r) => r.date },
                { key: "k", header: "Jenis", cell: (r) => (r.kind === "ayam" ? "Ayam" : "Barang Lain") },
                { key: "i", header: "Rincian", cell: (r) => (r.kind === "ayam" ? `${r.birds} ekor / ${r.weightKg} KG` : `${r.name} ${r.quantity} ${r.unit}`) },
                { key: "s", header: "Supplier", cell: (r) => r.supplier || "—" },
                { key: "t", header: "Total", align: "right", cell: (r) => formatRupiah(r.total), sortValue: (r) => r.total },
              ]} />
          </Section>
          <Section title="Per Supplier">
            <DataTable rows={report.purchasesBySupplier} rowKey={(r) => r.supplier} emptyText="Tidak ada data."
              columns={[
                { key: "s", header: "Supplier", cell: (r) => r.supplier },
                { key: "c", header: "Jumlah Pembelian", align: "right", cell: (r) => r.count },
                { key: "t", header: "Total", align: "right", cell: (r) => formatRupiah(r.total), sortValue: (r) => r.total },
              ]} />
          </Section>
        </div>
      )}
    </ReportShell>
  );
}

export function ExpenseReport() {
  return (
    <ReportShell title="Laporan Pengeluaran" actions={(d) => (
      <CsvButton onClick={() => downloadCsv(`laporan-pengeluaran-${d.report.from}_${d.report.to}.csv`,
        ["No", "Tanggal", "Kategori", "Pengeluaran", "Total"],
        d.expenseRows.map((e) => [e.number, e.date, e.category, e.name, e.total]))} />
    )}>
      {({ report, expenseRows }) => (
        <div className="space-y-5">
          <Stat label="Total Pengeluaran" value={formatRupiah(report.summary.expensesTotal)} />
          <Section title="Berdasarkan Kategori">
            <DataTable rows={report.expenseByCategory} rowKey={(r) => r.category} emptyText="Tidak ada pengeluaran pada periode ini."
              columns={[
                { key: "c", header: "Kategori", cell: (r) => r.category },
                { key: "t", header: "Total", align: "right", cell: (r) => formatRupiah(r.total), sortValue: (r) => r.total },
              ]} />
          </Section>
          <Section title="Berdasarkan Periode (harian)">
            <Chart type="bar" categories={report.daily.map((r) => r.date.slice(5))} colors={["#E71201"]} series={[{ name: "Pengeluaran", data: report.daily.map((r) => r.expenses) }]} />
          </Section>
          <Section title="Rincian">
            <DataTable rows={expenseRows} rowKey={(r) => r.id} emptyText="Tidak ada data."
              searchText={(r) => `${r.name} ${r.number}`} searchPlaceholder="Cari pengeluaran..."
              columns={[
                { key: "d", header: "Tanggal", cell: (r) => fmtDate(r.date), sortValue: (r) => r.date },
                { key: "n", header: "Pengeluaran", cell: (r) => r.name },
                { key: "c", header: "Kategori", cell: (r) => r.category },
                { key: "t", header: "Total", align: "right", cell: (r) => formatRupiah(r.total), sortValue: (r) => r.total },
              ]} />
          </Section>
        </div>
      )}
    </ReportShell>
  );
}

export function FinanceReport() {
  return (
    <ReportShell title="Laporan Keuangan" actions={(d) => (
      <CsvButton onClick={() => downloadCsv(`laporan-keuangan-${d.report.from}_${d.report.to}.csv`,
        ["Tanggal", "Penjualan", "Pembelian", "Pengeluaran", "Selisih"],
        d.report.daily.map((r) => [r.date, r.sales, r.purchases, r.expenses, r.sales - r.purchases - r.expenses]))} />
    )}>
      {({ report }) => {
        const s = report.summary;
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Total Penjualan" value={formatRupiah(s.salesTotal)} />
              <Stat label="Total Pembelian" value={formatRupiah(s.purchasesTotal)} />
              <Stat label="Total Pengeluaran" value={formatRupiah(s.expensesTotal)} />
              <Stat label="Selisih Pemasukan dan Pengeluaran" value={formatRupiah(s.net)} tone={s.net < 0 ? "text-red-600" : "text-green-600"} />
            </div>
            <Notice kind="info">
              Selisih ini adalah selisih kas: penjualan dikurangi pembelian dan pengeluaran pada periode yang dipilih.
              Angka ini bukan laba bersih akuntansi, karena pembelian bahan belum tentu terpakai seluruhnya pada periode yang sama
              (masih ada stok) dan biaya per potong ayam belum dialokasikan (HPP belum dihitung).
            </Notice>
            <Chart type="bar" colors={["#16A34A", "#F59E0B", "#E71201"]} categories={report.daily.map((r) => r.date.slice(5))}
              series={[
                { name: "Penjualan", data: report.daily.map((r) => r.sales) },
                { name: "Pembelian", data: report.daily.map((r) => r.purchases) },
                { name: "Pengeluaran", data: report.daily.map((r) => r.expenses) },
              ]} />
            <DataTable pageSize={15} rows={report.daily} rowKey={(r) => r.date} emptyText="Tidak ada data."
              columns={[
                { key: "d", header: "Tanggal", cell: (r) => fmtDate(r.date), sortValue: (r) => r.date },
                { key: "s", header: "Penjualan", align: "right", cell: (r) => formatRupiah(r.sales) },
                { key: "p", header: "Pembelian", align: "right", cell: (r) => formatRupiah(r.purchases) },
                { key: "e", header: "Pengeluaran", align: "right", cell: (r) => formatRupiah(r.expenses) },
                { key: "n", header: "Selisih", align: "right", cell: (r) => formatRupiah(r.sales - r.purchases - r.expenses), sortValue: (r) => r.sales - r.purchases - r.expenses },
              ]} />
          </div>
        );
      }}
    </ReportShell>
  );
}
