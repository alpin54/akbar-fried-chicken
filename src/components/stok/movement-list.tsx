"use client";

import { DataTable, type Column } from "@/components/ui/data-table";
import { apiGet, fmtDateTime } from "@/lib/client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type Move = {
  id: string; itemName?: string; itemId: string; type: string; qtyIn: number; qtyOut: number;
  balanceBefore?: number; stockAfter: number; ref: string; note?: string; ts: number;
};
const TYPE: Record<string, string> = {
  pembelian: "Pembelian", penjualan: "Penjualan", penyesuaian_masuk: "Penyesuaian Masuk",
  penyesuaian_keluar: "Penyesuaian Keluar", pembatalan_pembelian: "Pembatalan Pembelian",
  pembatalan_penjualan: "Pembatalan Penjualan",
};

export default function MovementList() {
  const [rows, setRows] = useState<Move[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState("");
  const item = useSearchParams().get("item");

  useEffect(() => {
    apiGet<{ movements: Move[] }>(`/api/stock-movements${item ? `?itemId=${encodeURIComponent(item)}` : ""}`)
      .then((d) => setRows(d.movements)).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  }, [item]);

  const columns: Column<Move>[] = [
    { key: "ts", header: "Waktu", cell: (r) => fmtDateTime(r.ts), sortValue: (r) => r.ts },
    { key: "type", header: "Jenis", cell: (r) => TYPE[r.type] ?? r.type },
    { key: "ref", header: "Referensi", cell: (r) => r.ref },
    { key: "item", header: "Barang", cell: (r) => r.itemName ?? r.itemId, sortValue: (r) => r.itemName ?? r.itemId },
    { key: "in", header: "Masuk", align: "right", cell: (r) => (r.qtyIn ? `+${r.qtyIn}` : "—") },
    { key: "out", header: "Keluar", align: "right", cell: (r) => (r.qtyOut ? `-${r.qtyOut}` : "—") },
    { key: "before", header: "Stok Sebelum", align: "right", cell: (r) => r.balanceBefore ?? "—" },
    { key: "after", header: "Stok Setelah", align: "right", cell: (r) => r.stockAfter },
    { key: "note", header: "Keterangan", cell: (r) => r.note || "—" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Riwayat Stok{item ? ` — ${rows[0]?.itemName ?? item}` : ""}</h1>
      <DataTable
        columns={columns} rows={type ? rows.filter((r) => r.type === type) : rows}
        rowKey={(r) => r.id} loading={loading} error={error} pageSize={15}
        emptyText="Belum ada pergerakan stok."
        searchText={(r) => `${r.itemName ?? ""} ${r.ref} ${r.note ?? ""}`} searchPlaceholder="Cari barang atau nomor..."
        toolbar={
          <select aria-label="Filter jenis" value={type} onChange={(e) => setType(e.target.value)}
            className="h-11 rounded-[10px] border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
            <option value="">Semua jenis</option>
            {Object.entries(TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        }
      />
    </div>
  );
}
