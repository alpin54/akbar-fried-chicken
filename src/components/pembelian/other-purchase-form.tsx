"use client";

import { Labeled } from "@/components/shared/labeled";
import { useIdemKey } from "@/components/shared/use-idem-key";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { apiGet, apiSend, todayISO } from "@/lib/client";
import { useRouter } from "@/i18n/navigation";
import { formatRupiah } from "@/lib/money";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PurchaseRecord } from "./types";

const SESSION_KEY = "fc_other_purchase_session_start";

export default function OtherPurchaseForm() {
  const router = useRouter();
  const key = useIdemKey();
  const nameRef = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(todayISO());
  const [supplier, setSupplier] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [unitPrice, setUnitPrice] = useState<number | null>(null);
  const [tracked, setTracked] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [items, setItems] = useState<PurchaseRecord[]>([]);

  // Sesi input: daftar diambil dari server, jadi tidak hilang saat halaman di-refresh.
  const loadSession = useCallback(async () => {
    let start = 0;
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) start = Number(saved);
      else { start = Date.now(); sessionStorage.setItem(SESSION_KEY, String(start)); }
    } catch { start = Date.now() - 12 * 3600_000; }
    const d = await apiGet<{ purchases: PurchaseRecord[] }>("/api/purchases");
    setItems(d.purchases.filter((p) => p.kind === "lainnya" && p.createdAt >= start));
  }, []);

  useEffect(() => { loadSession().catch(() => {}); }, [loadSession]);

  const qty = Number(quantity);
  const total = Number.isInteger(qty) && qty > 0 && unitPrice != null ? qty * unitPrice : 0;
  const touch = <T,>(set: (v: T) => void) => (v: T) => { key.reset(); setError(null); setSuccess(null); set(v); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !unit.trim() || !(qty > 0) || unitPrice == null) {
      setError("Isi nama barang, jumlah, satuan, dan harga satuan."); return;
    }
    setBusy(true); setError(null);
    try {
      await apiSend("/api/purchases/other", {
        date, supplier: supplier || undefined, name, unit, quantity: qty, unitPrice, tracked, note: note || undefined,
      }, { idemKey: key.get() });
      key.reset();
      setSuccess(`${name.trim()} berhasil disimpan. Silakan isi barang berikutnya.`);
      // Kosongkan form, tetap di halaman. Tanggal dan supplier dipertahankan agar cepat.
      setName(""); setQuantity(""); setUnit(""); setUnitPrice(null); setNote("");
      await loadSession().catch(() => {});
      nameRef.current?.focus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    router.push("/pembelian");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <form onSubmit={save} className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900" noValidate>
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Beli Barang Lain</h1>
        <div className="grid gap-4 sm:grid-cols-2">
          <Labeled label="Tanggal"><Input type="date" value={date} onChange={(e) => touch(setDate)(e.target.value)} /></Labeled>
          <Labeled label="Supplier (boleh dikosongkan)"><Input value={supplier} onChange={(e) => touch(setSupplier)(e.target.value)} /></Labeled>
          <div className="sm:col-span-2">
            <Labeled label="Nama barang">
              <Input ref={nameRef} placeholder="Contoh: Minyak goreng" value={name} onChange={(e) => touch(setName)(e.target.value)} />
            </Labeled>
          </div>
          <Labeled label="Jumlah"><Input inputMode="numeric" value={quantity} onChange={(e) => touch(setQuantity)(e.target.value.replace(/\D/g, ""))} /></Labeled>
          <Labeled label="Satuan"><Input placeholder="Contoh: liter, kg, pcs" value={unit} onChange={(e) => touch(setUnit)(e.target.value)} /></Labeled>
          <Labeled label="Harga per satuan"><CurrencyInput placeholder="Rp0" value={unitPrice} onValueChange={touch(setUnitPrice)} /></Labeled>
          <Labeled label="Catatan (boleh dikosongkan)"><Input value={note} onChange={(e) => touch(setNote)(e.target.value)} /></Labeled>
        </div>

        <label className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" className="mt-1 size-4" checked={tracked} onChange={(e) => touch(setTracked)(e.target.checked)} />
          <span>
            <span className="font-medium">Tambahkan ke Stok Barang</span>
            <span className="block text-gray-500">Matikan untuk barang habis pakai yang tidak dihitung stoknya (hanya dicatat sebagai pembelian).</span>
          </span>
        </label>

        <p className="text-lg font-semibold">Total: <span className="text-brand-600">{formatRupiah(total)}</span></p>

        {error && <Notice kind="error">{error}</Notice>}
        {success && <Notice kind="success">{success}</Notice>}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" size="lg" disabled={busy}>{busy ? "Menyimpan..." : "Simpan"}</Button>
          <Button type="button" size="lg" variant="outline" onClick={finish}>Selesai</Button>
        </div>
      </form>

      {items.length > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-3 font-semibold text-gray-800 dark:text-white/90">Sudah ditambahkan ({items.length})</h2>
          <ul className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
            {items.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 py-2">
                <span>{p.name} — {p.quantity} {p.unit}</span>
                <span className="font-medium">{formatRupiah(p.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
