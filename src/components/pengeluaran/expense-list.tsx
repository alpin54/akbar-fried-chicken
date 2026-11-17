"use client";

import { Labeled } from "@/components/shared/labeled";
import { useIdemKey } from "@/components/shared/use-idem-key";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { apiGet, apiSend, fmtDate, todayISO } from "@/lib/client";
import { formatRupiah } from "@/lib/money";
import { useCallback, useEffect, useState } from "react";

const CATEGORIES = ["Operasional", "Listrik", "Air", "Gas", "Transportasi", "Perawatan", "Lain-lain"];
const selectCls = "h-11 rounded-[10px] border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900";

type Expense = {
  id: string; number: string; date: string; category: string; name: string;
  quantity: number; amount: number; total: number; note: string;
};

export default function ExpenseList() {
  const [rows, setRows] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cat, setCat] = useState("");
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows((await apiGet<{ expenses: Expense[] }>("/api/expenses")).expenses);
      setError(null);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = rows.filter((r) => (!from || r.date >= from) && (!to || r.date <= to) && (!cat || r.category === cat));
  const sum = shown.reduce((s, r) => s + r.total, 0);

  const columns: Column<Expense>[] = [
    { key: "date", header: "Tanggal", cell: (r) => fmtDate(r.date), sortValue: (r) => r.date },
    { key: "name", header: "Pengeluaran", cell: (r) => <div><p className="font-medium">{r.name}</p>{r.note && <p className="text-xs text-gray-500">{r.note}</p>}</div>, sortValue: (r) => r.name },
    { key: "cat", header: "Kategori", cell: (r) => <Badge color="gray" size="sm">{r.category}</Badge> },
    { key: "qty", header: "Jumlah", align: "right", cell: (r) => r.quantity },
    { key: "amount", header: "Nominal", align: "right", cell: (r) => formatRupiah(r.amount) },
    { key: "total", header: "Total", align: "right", cell: (r) => <span className="font-medium">{formatRupiah(r.total)}</span>, sortValue: (r) => r.total },
    { key: "act", header: "", cell: (r) => (
      <div className="flex gap-2">
        <Button variant="outline" size="xs" onClick={() => setEditing(r)}>Ubah</Button>
        <Button variant="ghost" size="xs" className="text-red-600" onClick={() => setDeleting(r)}>Hapus</Button>
      </div>) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Pengeluaran</h1>
        <Button size="lg" onClick={() => setEditing("new")}>Tambah Pengeluaran</Button>
      </div>
      {flash && <Notice kind="success">{flash}</Notice>}
      <DataTable
        columns={columns} rows={shown} rowKey={(r) => r.id} loading={loading} error={error}
        emptyText="Belum ada pengeluaran."
        searchText={(r) => `${r.name} ${r.number} ${r.note}`} searchPlaceholder="Cari pengeluaran..."
        toolbar={<>
          <label className="flex items-center gap-2 text-sm text-gray-500">Dari
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></label>
          <label className="flex items-center gap-2 text-sm text-gray-500">Sampai
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></label>
          <select aria-label="Filter kategori" className={selectCls} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Semua kategori</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </>}
      />
      <p className="text-right text-sm text-gray-600">Total pengeluaran (sesuai filter): <span className="text-lg font-semibold text-gray-900 dark:text-white">{formatRupiah(sum)}</span></p>

      {editing && (
        <ExpenseForm
          expense={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={(msg) => { setEditing(null); setFlash(msg); load(); }}
        />
      )}
      {deleting && (
        <DeleteDialog
          expense={deleting} onClose={() => setDeleting(null)}
          onDone={() => { setDeleting(null); setFlash("Pengeluaran dihapus."); load(); }}
        />
      )}
    </div>
  );
}

function ExpenseForm({ expense, onClose, onDone }: { expense: Expense | null; onClose: () => void; onDone: (m: string) => void }) {
  const key = useIdemKey();
  const [date, setDate] = useState(expense?.date ?? todayISO());
  const [category, setCategory] = useState(expense?.category ?? CATEGORIES[0]);
  const [name, setName] = useState(expense?.name ?? "");
  const [quantity, setQuantity] = useState(String(expense?.quantity ?? 1));
  const [amount, setAmount] = useState<number | null>(expense?.amount ?? null);
  const [note, setNote] = useState(expense?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const touch = <T,>(set: (v: T) => void) => (v: T) => { key.reset(); setError(null); set(v); };

  const qty = Number(quantity);
  const total = qty > 0 && amount != null ? qty * amount : 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !(qty > 0) || amount == null) { setError("Isi nama, jumlah, dan nominal."); return; }
    setBusy(true);
    const data = { date, category, name, quantity: qty, amount, note: note || undefined };
    try {
      if (expense) await apiSend(`/api/expenses/${expense.id}`, data, { method: "PUT" });
      else await apiSend("/api/expenses", data, { idemKey: key.get() });
      key.reset();
      onDone(expense ? "Pengeluaran diperbarui." : "Pengeluaran berhasil disimpan.");
    } catch (err) { setError((err as Error).message); setBusy(false); }
  };

  return (
    <Modal title={expense ? `Ubah Pengeluaran ${expense.number}` : "Tambah Pengeluaran"} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Labeled label="Tanggal"><Input type="date" value={date} onChange={(e) => touch(setDate)(e.target.value)} /></Labeled>
        <Labeled label="Kategori">
          <select className={selectCls + " w-full"} value={category} onChange={(e) => touch(setCategory)(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Labeled>
        <Labeled label="Nama pengeluaran"><Input placeholder="Contoh: Token listrik" value={name} onChange={(e) => touch(setName)(e.target.value)} /></Labeled>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Jumlah"><Input inputMode="numeric" value={quantity} onChange={(e) => touch(setQuantity)(e.target.value.replace(/\D/g, ""))} /></Labeled>
          <Labeled label="Nominal per satuan"><CurrencyInput placeholder="Rp0" value={amount} onValueChange={touch(setAmount)} /></Labeled>
        </div>
        <Labeled label="Catatan (boleh dikosongkan)"><Input value={note} onChange={(e) => touch(setNote)(e.target.value)} /></Labeled>
        <p className="text-lg font-semibold">Total: <span className="text-brand-600">{formatRupiah(total)}</span></p>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex gap-3">
          <Button type="submit" size="lg" disabled={busy}>{busy ? "Menyimpan..." : "Simpan"}</Button>
          <Button type="button" size="lg" variant="outline" onClick={onClose}>Batal</Button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteDialog({ expense, onClose, onDone }: { expense: Expense; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const del = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/expenses/${expense.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Gagal menghapus pengeluaran");
      onDone();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <Modal title="Hapus pengeluaran?" onClose={onClose}>
      <p className="mb-4 text-sm text-gray-600">
        {expense.name} ({formatRupiah(expense.total)}) akan dihapus dari laporan. Tindakan ini dicatat di log aktivitas.
      </p>
      {error && <div className="mb-3"><Notice kind="error">{error}</Notice></div>}
      <div className="flex gap-3">
        <Button variant="destructive" size="lg" disabled={busy} onClick={del}>{busy ? "Menghapus..." : "Ya, Hapus"}</Button>
        <Button variant="outline" size="lg" onClick={onClose}>Batal</Button>
      </div>
    </Modal>
  );
}
