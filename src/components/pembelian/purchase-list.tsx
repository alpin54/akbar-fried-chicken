"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { DataTable, type Column } from "@/components/ui/data-table";
import { apiGet, fmtDate } from "@/lib/client";
import { formatRupiah } from "@/lib/money";
import { Link } from "@/i18n/navigation";
import { useEffect, useMemo, useState } from "react";
import { summarize, type PurchaseRecord } from "./types";

export default function PurchaseList() {
  const [rows, setRows] = useState<PurchaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<PurchaseRecord | null>(null);
  const [kind, setKind] = useState<"" | "ayam" | "lainnya">("");

  useEffect(() => {
    apiGet<{ purchases: PurchaseRecord[] }>("/api/purchases")
      .then((d) => setRows(d.purchases))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const shown = useMemo(() => (kind ? rows.filter((r) => r.kind === kind) : rows), [rows, kind]);

  const columns: Column<PurchaseRecord>[] = [
    { key: "number", header: "No. Pembelian", cell: (r) => <span className="font-medium">{r.number}</span>, sortValue: (r) => r.number },
    { key: "date", header: "Tanggal", cell: (r) => fmtDate(r.date), sortValue: (r) => r.date },
    { key: "kind", header: "Jenis", cell: (r) => <Badge color={r.kind === "ayam" ? "primary" : "gray"} size="sm">{r.kind === "ayam" ? "Ayam" : "Barang Lain"}</Badge> },
    { key: "item", header: "Rincian", cell: summarize },
    { key: "supplier", header: "Supplier", cell: (r) => r.supplier || "—" },
    { key: "total", header: "Total", align: "right", cell: (r) => formatRupiah(r.total), sortValue: (r) => r.total },
    { key: "act", header: "", cell: (r) => <Button size="xs" variant="outline" onClick={() => setDetail(r)}>Detail</Button> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Pembelian</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/pembelian/ayam"><Button size="lg">Beli Ayam</Button></Link>
          <Link href="/pembelian/barang-lain"><Button size="lg" variant="outline">Beli Barang Lain</Button></Link>
        </div>
      </div>
      {detail && <PurchaseDetail p={detail} onClose={() => setDetail(null)} />}
      <DataTable
        columns={columns}
        rows={shown}
        rowKey={(r) => r.id}
        loading={loading}
        error={error}
        emptyText="Belum ada pembelian. Tekan Beli Ayam atau Beli Barang Lain."
        searchText={(r) => `${r.number} ${summarize(r)} ${r.supplier}`}
        searchPlaceholder="Cari pembelian..."
        toolbar={
          <select
            aria-label="Filter jenis"
            className="h-11 rounded-[10px] border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="">Semua jenis</option>
            <option value="ayam">Ayam</option>
            <option value="lainnya">Barang Lain</option>
          </select>
        }
      />
    </div>
  );
}

const PARTS: [string, string][] = [["dada", "Dada"], ["paha_atas", "Paha Atas"], ["paha_bawah", "Paha Bawah"], ["sayap", "Sayap"]];

function PurchaseDetail({ p, onClose }: { p: PurchaseRecord; onClose: () => void }) {
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-1.5"><dt className="text-gray-500">{label}</dt><dd className="text-right font-medium">{value}</dd></div>
  );
  return (
    <Modal title={`Pembelian ${p.number}`} onClose={onClose} wide>
      <dl className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
        {row("Tanggal", fmtDate(p.date))}
        {row("Supplier", p.supplier || "—")}
        {p.kind === "ayam" ? (<>
          {row("Total berat", `${p.weightKg} KG`)}
          {row("Jumlah ayam", `${p.birds} ekor`)}
          {row("Harga per KG", formatRupiah(p.pricePerKg ?? 0))}
        </>) : (<>
          {row("Barang", p.name)}
          {row("Jumlah", `${p.quantity} ${p.unit}`)}
          {row("Harga satuan", formatRupiah(p.unitPrice ?? 0))}
          {row("Masuk stok", p.tracked ? "Ya" : "Tidak (hanya dicatat sebagai pembelian)")}
        </>)}
        {row("Total biaya", formatRupiah(p.total))}
        {p.note && row("Catatan", p.note)}
      </dl>
      {p.kind === "ayam" && p.recipeSnapshot && p.pieces && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold">Aturan potongan saat pembelian dan hasil konversi</p>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500"><th className="py-1 font-medium">Produk</th><th className="py-1 text-right font-medium">Per ekor</th><th className="py-1 text-right font-medium">Stok masuk</th></tr></thead>
            <tbody>
              {PARTS.map(([id, label]) => (
                <tr key={id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="py-1.5">{label}</td>
                  <td className="py-1.5 text-right">{p.recipeSnapshot?.[id] ?? 0}</td>
                  <td className="py-1.5 text-right font-medium">+{p.pieces?.[id] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-5"><Button variant="outline" onClick={onClose}>Tutup</Button></div>
    </Modal>
  );
}
