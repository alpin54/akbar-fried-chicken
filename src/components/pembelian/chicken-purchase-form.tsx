"use client";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Labeled } from "@/components/shared/labeled";
import { useIdemKey } from "@/components/shared/use-idem-key";
import { apiGet, apiSend, todayISO } from "@/lib/client";
import { computeChickenPurchase, DEFAULT_CONVERSION, type ConversionRecipe } from "@/lib/domain/purchases";
import { formatRupiah } from "@/lib/money";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";

const LABEL: Record<string, string> = {
  dada: "Dada", paha_atas: "Paha Atas", paha_bawah: "Paha Bawah", sayap: "Sayap",
};

export default function ChickenPurchaseForm() {
  const router = useRouter();
  const key = useIdemKey();
  const [recipe, setRecipe] = useState<ConversionRecipe>(DEFAULT_CONVERSION); // hanya untuk pratinjau; server memakai resep tersimpan
  const [date, setDate] = useState(todayISO());
  const [supplier, setSupplier] = useState("");
  const [weight, setWeight] = useState("");
  const [birds, setBirds] = useState("");
  const [pricePerKg, setPricePerKg] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ conversion: ConversionRecipe }>("/api/settings/recipes").then((d) => setRecipe(d.conversion)).catch(() => {});
  }, []);

  const weightKg = Number(weight.replace(",", "."));
  const birdsN = Number(birds);
  const calc =
    weightKg > 0 && Number.isInteger(birdsN) && birdsN > 0 && pricePerKg
      ? computeChickenPurchase({ weightKg, birds: birdsN, pricePerKg }, recipe)
      : null;

  const touch = <T,>(set: (v: T) => void) => (v: T) => { key.reset(); setError(null); set(v); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calc?.ok || !pricePerKg) { setError("Lengkapi berat, jumlah ekor, dan harga per KG."); return; }
    setBusy(true); setError(null);
    try {
      await apiSend("/api/purchases/chicken", {
        date, supplier: supplier || undefined, weightKg, birds: birdsN, pricePerKg, note: note || undefined,
      }, { idemKey: key.get() });
      key.reset();
      router.push("/pembelian");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-5 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900" noValidate>
      <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Beli Ayam</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Labeled label="Tanggal">
          <Input type="date" value={date} onChange={(e) => touch(setDate)(e.target.value)} />
        </Labeled>
        <Labeled label="Supplier (boleh dikosongkan)">
          <Input value={supplier} onChange={(e) => touch(setSupplier)(e.target.value)} />
        </Labeled>
        <Labeled label="Total berat (KG)">
          <Input inputMode="decimal" placeholder="Contoh: 20" value={weight} onChange={(e) => touch(setWeight)(e.target.value)} />
        </Labeled>
        <Labeled label="Jumlah ayam (ekor)">
          <Input inputMode="numeric" placeholder="Contoh: 5" value={birds} onChange={(e) => touch(setBirds)(e.target.value.replace(/\D/g, ""))} />
        </Labeled>
        <Labeled label="Harga per KG">
          <CurrencyInput placeholder="Rp0" value={pricePerKg} onValueChange={touch(setPricePerKg)} />
        </Labeled>
        <Labeled label="Catatan (boleh dikosongkan)">
          <Input value={note} onChange={(e) => touch(setNote)(e.target.value)} />
        </Labeled>
      </div>

      <div className="rounded-xl bg-brand-50 p-4 dark:bg-brand-500/10">
        <p className="text-sm text-gray-600 dark:text-gray-300">Total pembelian</p>
        <p className="text-2xl font-bold text-brand-600">{calc?.ok ? formatRupiah(calc.total) : "Rp0"}</p>
        {calc?.ok && (
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
            Stok bertambah ({calc.totalPieces} potong):{" "}
            {Object.entries(calc.pieces).map(([id, q]) => `${LABEL[id]} +${q}`).join(", ")}
          </p>
        )}
        <p className="mt-1 text-xs text-gray-500">Jumlah potongan dihitung dari jumlah ekor, bukan dari berat.</p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex gap-3">
        <Button type="submit" size="lg" disabled={busy}>{busy ? "Menyimpan..." : "Simpan Pembelian"}</Button>
        <Button type="button" size="lg" variant="outline" onClick={() => router.push("/pembelian")}>Batal</Button>
      </div>
    </form>
  );
}

