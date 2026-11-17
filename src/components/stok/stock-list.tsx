"use client";

import { Labeled } from "@/components/shared/labeled";
import { useIdemKey } from "@/components/shared/use-idem-key";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { apiGet, apiSend, todayISO } from "@/lib/client";
import { Link } from "@/i18n/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Row = { id: string; name: string; category: string; unit: string; stock: number; minStock: number; status: "Tersedia" | "Stok Menipis" | "Habis" };
const COLOR = { Tersedia: "success", "Stok Menipis": "warning", Habis: "error" } as const;
const selectCls = "h-11 rounded-[10px] border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900";

export default function StockList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState("");
  const [status, setStatus] = useState("");
  const [adjust, setAdjust] = useState<Row | null>(null);
  const [minFor, setMinFor] = useState<Row | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows((await apiGet<{ items: Row[] }>("/api/inventory")).items);
      setError(null);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const categories = useMemo(() => [...new Set(rows.map((r) => r.category))].sort(), [rows]);
  const shown = rows.filter((r) => (!cat || r.category === cat) && (!status || r.status === status));

  const columns: Column<Row>[] = [
    { key: "name", header: "Nama Barang", cell: (r) => <span className="font-medium">{r.name}</span>, sortValue: (r) => r.name },
    { key: "category", header: "Kategori", cell: (r) => r.category },
    { key: "unit", header: "Satuan", cell: (r) => r.unit },
    { key: "stock", header: "Stok Saat Ini", align: "right", cell: (r) => r.stock, sortValue: (r) => r.stock },
    { key: "min", header: "Stok Minimum", align: "right", cell: (r) => r.minStock },
    { key: "status", header: "Status", cell: (r) => <Badge color={COLOR[r.status]} size="sm">{r.status}</Badge> },
    { key: "act", header: "", cell: (r) => (
      <div className="flex gap-2">
        <Button variant="outline" size="xs" onClick={() => setAdjust(r)}>Sesuaikan</Button>
        <Button variant="ghost" size="xs" onClick={() => setMinFor(r)}>Atur Minimum</Button>
        <Link href={`/stok/riwayat?item=${r.id}`}><Button variant="ghost" size="xs">Riwayat</Button></Link>
      </div>) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Stok Barang</h1>
        <Link href="/stok/riwayat"><Button variant="outline">Lihat Riwayat Stok</Button></Link>
      </div>
      {flash && <Notice kind="success">{flash}</Notice>}
      <DataTable
        columns={columns} rows={shown} rowKey={(r) => r.id} loading={loading} error={error}
        emptyText="Belum ada barang yang dilacak stoknya."
        searchText={(r) => `${r.name} ${r.category}`} searchPlaceholder="Cari barang..."
        toolbar={<>
          <select aria-label="Filter kategori" className={selectCls} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Semua kategori</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select aria-label="Filter status" className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Semua status</option>
            <option>Tersedia</option><option>Stok Menipis</option><option>Habis</option>
          </select>
        </>}
      />
      {minFor && (
        <MinDialog item={minFor} onClose={() => setMinFor(null)}
          onDone={(msg) => { setMinFor(null); setFlash(msg); load(); }} />
      )}
      {adjust && (
        <AdjustDialog
          item={adjust}
          onClose={() => setAdjust(null)}
          onDone={(msg) => { setAdjust(null); setFlash(msg); load(); }}
        />
      )}
    </div>
  );
}

function AdjustDialog({ item, onClose, onDone }: { item: Row; onClose: () => void; onDone: (msg: string) => void }) {
  const key = useIdemKey();
  const [direction, setDirection] = useState<"masuk" | "keluar">("masuk");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const touch = <T,>(set: (v: T) => void) => (v: T) => { key.reset(); setError(null); set(v); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = Number(qty);
    if (!(q > 0) || reason.trim().length < 3) { setError("Isi jumlah dan alasan penyesuaian."); return; }
    setBusy(true);
    try {
      await apiSend("/api/inventory/adjust", { itemId: item.id, quantity: q, direction, reason, date }, { idemKey: key.get() });
      key.reset();
      onDone(`Stok ${item.name} berhasil disesuaikan.`);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`Sesuaikan stok ${item.name}`}
      className="fixed inset-0 z-99999 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <form onSubmit={submit} noValidate onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 dark:bg-gray-900">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Sesuaikan Stok</h2>
          <p className="text-sm text-gray-500">{item.name} — stok sekarang {item.stock} {item.unit}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(["masuk", "keluar"] as const).map((d) => (
            <button key={d} type="button" onClick={() => touch(setDirection)(d)}
              className={`h-11 rounded-xl border text-sm font-semibold ${direction === d ? "border-brand-500 bg-brand-50 text-brand-600" : "border-gray-200 text-gray-700"}`}>
              {d === "masuk" ? "Stok Masuk" : "Stok Keluar"}
            </button>
          ))}
        </div>
        <Labeled label={`Jumlah (${item.unit})`}><Input inputMode="numeric" value={qty} onChange={(e) => touch(setQty)(e.target.value.replace(/\D/g, ""))} /></Labeled>
        <Labeled label="Alasan"><Input placeholder="Contoh: Hitung ulang stok / barang rusak" value={reason} onChange={(e) => touch(setReason)(e.target.value)} /></Labeled>
        <Labeled label="Tanggal"><Input type="date" value={date} onChange={(e) => touch(setDate)(e.target.value)} /></Labeled>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex gap-3">
          <Button type="submit" size="lg" disabled={busy}>{busy ? "Menyimpan..." : "Simpan"}</Button>
          <Button type="button" size="lg" variant="outline" onClick={onClose}>Batal</Button>
        </div>
      </form>
    </div>
  );
}

function MinDialog({ item, onClose, onDone }: { item: Row; onClose: () => void; onDone: (msg: string) => void }) {
  const [val, setVal] = useState(String(item.minStock));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (val === "") { setError("Isi stok minimum."); return; }
    setBusy(true);
    try {
      await apiSend(`/api/inventory/${item.id}`, { minStock: Number(val) }, { method: "PUT" });
      onDone(`Stok minimum ${item.name} disimpan.`);
    } catch (err) { setError((err as Error).message); setBusy(false); }
  };
  return (
    <Modal title={`Stok Minimum ${item.name}`} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <p className="text-sm text-gray-500">Status berubah menjadi Stok Menipis bila stok sama dengan atau di bawah angka ini.</p>
        <Labeled label={`Stok minimum (${item.unit})`}><Input inputMode="numeric" value={val} onChange={(e) => { setVal(e.target.value.replace(/\D/g, "")); setError(null); }} /></Labeled>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex gap-3">
          <Button type="submit" size="lg" disabled={busy}>{busy ? "Menyimpan..." : "Simpan"}</Button>
          <Button type="button" size="lg" variant="outline" onClick={onClose}>Batal</Button>
        </div>
      </form>
    </Modal>
  );
}
