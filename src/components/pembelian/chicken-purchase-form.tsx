"use client";

import { Labeled } from "@/components/shared/labeled";
import { useIdemKey } from "@/components/shared/use-idem-key";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { apiGet, apiSend, todayISO } from "@/lib/client";
import { computePieces, DEFAULT_CONVERSION, PIECE_PRODUCTS, type ConversionRecipe, type PieceProduct } from "@/lib/domain/purchases";
import { formatRupiah } from "@/lib/money";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useRef, useState } from "react";

const LABEL: Record<PieceProduct, string> = { dada: "Dada", paha_atas: "Paha Atas", paha_bawah: "Paha Bawah", sayap: "Sayap" };
type RuleDraft = Record<PieceProduct, string>;
const toDraft = (r: ConversionRecipe): RuleDraft => ({
  dada: String(r.dada), paha_atas: String(r.paha_atas), paha_bawah: String(r.paha_bawah), sayap: String(r.sayap),
});

export default function ChickenPurchaseForm() {
  const router = useRouter();
  const key = useIdemKey();
  // Aturan default global (Pengaturan, Aturan Potongan Ayam). Hanya dibaca; tidak pernah diubah dari form ini.
  const [defaultRule, setDefaultRule] = useState<ConversionRecipe>(DEFAULT_CONVERSION);
  const [rule, setRule] = useState<RuleDraft>(toDraft(DEFAULT_CONVERSION)); // aturan KHUSUS pembelian ini
  const [date, setDate] = useState(todayISO());
  const [supplier, setSupplier] = useState("");
  const [weight, setWeight] = useState("");
  const [birds, setBirds] = useState("");
  const [pricePerKg, setPricePerKg] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ruleTouched = useRef(false); // true bila pengguna sudah mengetik aturan sendiri

  useEffect(() => {
    apiGet<{ conversion: ConversionRecipe }>("/api/settings/recipes")
      .then((d) => {
        setDefaultRule(d.conversion);
        setRule((cur) => (ruleTouched.current ? cur : toDraft(d.conversion))); // jangan menimpa ketikan pengguna
      })
      .catch(() => {});
  }, []);

  const weightKg = Number(weight.replace(",", "."));
  const birdsN = Number(birds);
  const filled = PIECE_PRODUCTS.every((p) => rule[p] !== "");
  const ruleNums: ConversionRecipe = {
    dada: Number(rule.dada), paha_atas: Number(rule.paha_atas), paha_bawah: Number(rule.paha_bawah), sayap: Number(rule.sayap),
  };
  // Preview memakai fungsi yang sama dengan server, jadi angkanya identik dengan yang disimpan.
  const conv = filled && birdsN > 0 ? computePieces(birdsN, ruleNums) : null;
  const ruleError = !filled ? "Isi jumlah potongan semua produk (boleh 0)." : conv && !conv.ok ? conv.error : null;
  const total = weightKg > 0 && pricePerKg ? Math.round(weightKg * pricePerKg) : 0;

  const touch = <T,>(set: (v: T) => void) => (v: T) => { key.reset(); setError(null); set(v); };
  const setRuleValue = (p: PieceProduct, v: string) => {
    key.reset(); setError(null); ruleTouched.current = true;
    setRule((cur) => ({ ...cur, [p]: v.replace(/\D/g, "") }));
  };
  const useDefault = () => { key.reset(); setError(null); ruleTouched.current = true; setRule(toDraft(defaultRule)); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(weightKg > 0) || !(birdsN > 0) || !pricePerKg) { setError("Lengkapi berat, jumlah ekor, dan harga per KG."); return; }
    if (!conv || !conv.ok) { setError(ruleError ?? "Aturan potongan belum valid."); return; }
    setBusy(true); setError(null);
    try {
      await apiSend("/api/purchases/chicken", {
        date, supplier: supplier || undefined, weightKg, birds: birdsN, pricePerKg, note: note || undefined,
        cuttingRule: ruleNums,
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
        <Labeled label="Tanggal"><Input type="date" value={date} onChange={(e) => touch(setDate)(e.target.value)} /></Labeled>
        <Labeled label="Supplier (boleh dikosongkan)"><Input value={supplier} onChange={(e) => touch(setSupplier)(e.target.value)} /></Labeled>
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

      <section className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-white/90">Aturan Potongan Ayam</h2>
            <p className="text-sm text-gray-500">Jumlah potongan per ekor untuk pembelian ini saja. Aturan default tidak berubah.</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={useDefault}>Gunakan Aturan Default</Button>
        </div>
        <p className="text-xs text-gray-500">
          Aturan default saat ini: {PIECE_PRODUCTS.map((p) => `${LABEL[p]} ${defaultRule[p]}`).join(", ")}.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PIECE_PRODUCTS.map((p) => (
            <Labeled key={p} label={`${LABEL[p]} per ekor`}>
              <Input inputMode="numeric" value={rule[p]} onChange={(e) => setRuleValue(p, e.target.value)} />
            </Labeled>
          ))}
        </div>
        {ruleError && <Notice kind="error">{ruleError}</Notice>}
      </section>

      <div className="rounded-xl bg-brand-50 p-4 dark:bg-brand-500/10">
        <p className="text-sm text-gray-600 dark:text-gray-300">Total pembelian</p>
        <p className="text-2xl font-bold text-brand-600">{formatRupiah(total)}</p>
        <p className="mb-3 mt-1 text-xs text-gray-500">Biaya dihitung dari berat (KG). Stok dihitung dari jumlah ekor.</p>
        {conv?.ok ? (
          <table className="w-full text-sm">
            <caption className="mb-1 text-left font-medium text-gray-700 dark:text-gray-300">Preview stok masuk ({birdsN} ekor)</caption>
            <thead><tr className="text-left text-gray-500"><th className="py-1 font-medium">Produk</th><th className="py-1 text-right font-medium">Potongan/Ekor</th><th className="py-1 text-right font-medium">Total Masuk</th></tr></thead>
            <tbody>
              {PIECE_PRODUCTS.map((p) => (
                <tr key={p} className="border-t border-brand-100 dark:border-gray-700">
                  <td className="py-1.5">{LABEL[p]}</td>
                  <td className="py-1.5 text-right">{ruleNums[p]}</td>
                  <td className="py-1.5 text-right font-medium">{conv.pieces[p] ?? 0}</td>
                </tr>
              ))}
              <tr className="border-t border-brand-200 font-semibold dark:border-gray-600">
                <td className="py-1.5">Total</td><td className="py-1.5 text-right">{conv.perBird}</td><td className="py-1.5 text-right">{conv.totalPieces}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">Isi jumlah ekor untuk melihat preview stok masuk.</p>
        )}
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex gap-3">
        <Button type="submit" size="lg" disabled={busy}>{busy ? "Menyimpan..." : "Simpan Pembelian"}</Button>
        <Button type="button" size="lg" variant="outline" onClick={() => router.push("/pembelian")}>Batal</Button>
      </div>
    </form>
  );
}
