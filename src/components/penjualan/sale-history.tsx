"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { useIdemKey } from "@/components/shared/use-idem-key";
import { apiGet, apiSend, fmtDateTime } from "@/lib/client";
import { formatRupiah } from "@/lib/money";
import { useCallback, useEffect, useMemo, useState } from "react";

const PART: Record<string, string> = { dada: "Dada", sayap: "Sayap", paha_atas: "Paha Atas", paha_bawah: "Paha Bawah" };
const STOCK_LABEL: Record<string, string> = { ...PART, sambal: "Sambal" };

export type SaleRecord = {
  id: string; number: string; status: "selesai" | "dibatalkan"; createdAt: number; cashierName: string;
  items: { productId: string; productName: string; unitPrice: number; quantity: number; variant: string | null; subtotal: number }[];
  total: number; received: number; change: number; consumption?: Record<string, number>;
  cancellation?: { at: number; byName: string; reason: string };
};

const localDate = (ts: number) => new Date(ts).toLocaleDateString("sv-SE");
const itemText = (it: SaleRecord["items"][number]) =>
  `${it.quantity}× ${it.productName}${it.variant ? ` (${PART[it.variant]})` : ""}`;
const selectCls = "h-11 rounded-[10px] border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900";

export default function SaleHistory() {
  const [rows, setRows] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [product, setProduct] = useState("");
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState<SaleRecord | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows((await apiGet<{ sales: SaleRecord[] }>("/api/sales?limit=100")).sales);
      setError(null);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const products = useMemo(() => [...new Set(rows.flatMap((r) => r.items.map((i) => i.productName)))].sort(), [rows]);
  const shown = rows.filter((r) => {
    const d = localDate(r.createdAt);
    return (!from || d >= from) && (!to || d <= to) && (!status || r.status === status) &&
      (!product || r.items.some((i) => i.productName === product));
  });

  const columns: Column<SaleRecord>[] = [
    { key: "number", header: "No. Transaksi", cell: (r) => <span className="font-medium">{r.number}</span>, sortValue: (r) => r.number },
    { key: "time", header: "Tanggal & Jam", cell: (r) => fmtDateTime(r.createdAt), sortValue: (r) => r.createdAt },
    { key: "items", header: "Produk", cell: (r) => <span className="line-clamp-2 min-w-48">{r.items.map(itemText).join(", ")}</span> },
    { key: "qty", header: "Jumlah", align: "right", cell: (r) => r.items.reduce((s, i) => s + i.quantity, 0) },
    { key: "total", header: "Total", align: "right", cell: (r) => formatRupiah(r.total), sortValue: (r) => r.total },
    { key: "received", header: "Diterima", align: "right", cell: (r) => formatRupiah(r.received) },
    { key: "change", header: "Kembalian", align: "right", cell: (r) => formatRupiah(r.change) },
    { key: "status", header: "Status", cell: (r) => <Badge color={r.status === "selesai" ? "success" : "error"} size="sm">{r.status === "selesai" ? "Selesai" : "Dibatalkan"}</Badge> },
    { key: "act", header: "", cell: (r) => <Button variant="outline" size="xs" onClick={() => setDetail(r)}>Detail</Button> },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Riwayat Penjualan</h1>
      {flash && <Notice kind="success">{flash}</Notice>}
      <DataTable
        columns={columns} rows={shown} rowKey={(r) => r.id} loading={loading} error={error}
        emptyText="Belum ada transaksi."
        searchText={(r) => r.number} searchPlaceholder="Cari nomor transaksi..."
        toolbar={<>
          <label className="flex items-center gap-2 text-sm text-gray-500">Dari
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></label>
          <label className="flex items-center gap-2 text-sm text-gray-500">Sampai
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></label>
          <select aria-label="Filter produk" className={selectCls} value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="">Semua produk</option>
            {products.map((p) => <option key={p}>{p}</option>)}
          </select>
          <select aria-label="Filter status" className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Semua status</option>
            <option value="selesai">Selesai</option>
            <option value="dibatalkan">Dibatalkan</option>
          </select>
        </>}
      />
      {detail && (
        <SaleDetail sale={detail} onClose={() => setDetail(null)}
          onCancelled={() => { setDetail(null); setFlash(`Transaksi ${detail.number} dibatalkan dan stok dikembalikan.`); load(); }} />
      )}
    </div>
  );
}

function SaleDetail({ sale, onClose, onCancelled }: { sale: SaleRecord; onClose: () => void; onCancelled: () => void }) {
  const key = useIdemKey();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = async () => {
    if (reason.trim().length < 3) { setError("Isi alasan pembatalan."); return; }
    setBusy(true);
    try {
      await apiSend(`/api/sales/${sale.id}/cancel`, { reason }, { idemKey: key.get() });
      onCancelled();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  return (
    <Modal title={`Transaksi ${sale.number}`} onClose={onClose} wide>
      <p className="mb-3 text-sm text-gray-500">{fmtDateTime(sale.createdAt)} · Kasir: {sale.cashierName}</p>
      <ul className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
        {sale.items.map((it, i) => (
          <li key={i} className="flex justify-between gap-3 py-2">
            <span>{itemText(it)} <span className="text-gray-500">@ {formatRupiah(it.unitPrice)}</span></span>
            <span className="font-medium">{formatRupiah(it.subtotal)}</span>
          </li>
        ))}
      </ul>
      {sale.consumption && Object.keys(sale.consumption).length > 0 && (
        <p className="mt-3 text-sm text-gray-600">
          Stok {sale.status === "dibatalkan" ? "(sudah dikembalikan)" : "dikurangi"}:{" "}
          {Object.entries(sale.consumption).map(([id, q]) => `${STOCK_LABEL[id] ?? id} ${q}`).join(", ")}
        </p>
      )}
      <dl className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm dark:border-gray-800">
        <div className="flex justify-between"><dt>Total</dt><dd className="font-semibold">{formatRupiah(sale.total)}</dd></div>
        <div className="flex justify-between"><dt>Uang Diterima</dt><dd>{formatRupiah(sale.received)}</dd></div>
        <div className="flex justify-between"><dt>Kembalian</dt><dd>{formatRupiah(sale.change)}</dd></div>
      </dl>
      {sale.status === "dibatalkan" && sale.cancellation && (
        <div className="mt-3"><Notice kind="error">
          Dibatalkan {fmtDateTime(sale.cancellation.at)} oleh {sale.cancellation.byName}. Alasan: {sale.cancellation.reason}
        </Notice></div>
      )}
      {asking && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-gray-600">Stok akan dikembalikan. Riwayat transaksi tetap tersimpan.</p>
          <Input placeholder="Alasan pembatalan" value={reason} onChange={(e) => { key.reset(); setReason(e.target.value); setError(null); }} />
          {error && <Notice kind="error">{error}</Notice>}
          <div className="flex gap-3">
            <Button variant="destructive" disabled={busy} onClick={cancel}>{busy ? "Memproses..." : "Ya, Batalkan Transaksi"}</Button>
            <Button variant="outline" onClick={() => setAsking(false)}>Kembali</Button>
          </div>
        </div>
      )}
      {!asking && (
        <div className="mt-5 flex flex-wrap gap-3 print:hidden">
          <Button variant="outline" onClick={() => window.print()}>Cetak Struk</Button>
          {sale.status === "selesai" && <Button variant="destructive" onClick={() => setAsking(true)}>Batalkan Transaksi</Button>}
          <Button variant="ghost" onClick={onClose}>Tutup</Button>
        </div>
      )}
    </Modal>
  );
}
