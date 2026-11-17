"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { apiGet, apiSend } from "@/lib/client";
import { useEffect, useState } from "react";

type Conv = { dada: number; paha_atas: number; paha_bawah: number; sayap: number };
type Draft = Record<keyof Conv, string>;
const ROWS: { key: keyof Conv; label: string }[] = [
  { key: "dada", label: "Dada" },
  { key: "paha_atas", label: "Paha Atas" },
  { key: "paha_bawah", label: "Paha Bawah" },
  { key: "sayap", label: "Sayap" },
];
const toDraft = (c: Conv): Draft => ({
  dada: String(c.dada), paha_atas: String(c.paha_atas), paha_bawah: String(c.paha_bawah), sayap: String(c.sayap),
});

export default function ConversionForm() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<"save" | "reset" | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    apiGet<{ conversion: Conv }>("/api/settings/recipes")
      .then((d) => { setDraft(toDraft(d.conversion)); setSaved(toDraft(d.conversion)); })
      .catch((e: Error) => setMsg({ kind: "error", text: e.message }));
  }, []);

  if (!draft || !saved) return msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : <p className="text-sm text-gray-500">Memuat...</p>;

  const total = ROWS.reduce((s, r) => s + (Number(draft[r.key]) || 0), 0);
  const empty = ROWS.some((r) => draft[r.key] === "");
  const changed = ROWS.some((r) => draft[r.key] !== saved[r.key]);
  const invalid = empty ? "Isi semua jumlah potongan (boleh 0)." : total < 1 ? "Minimal satu jenis potongan harus lebih dari 0." : null;

  const apply = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = confirm === "reset"
        ? await apiSend<{ conversion: Conv }>("/api/settings/recipes", { resetConversion: true }, { method: "PUT" })
        : await apiSend<{ conversion: Conv }>("/api/settings/recipes", {
            conversion: { dada: Number(draft.dada), paha_atas: Number(draft.paha_atas), paha_bawah: Number(draft.paha_bawah), sayap: Number(draft.sayap) },
          }, { method: "PUT" });
      setDraft(toDraft(res.conversion)); setSaved(toDraft(res.conversion));
      setMsg({ kind: "success", text: confirm === "reset" ? "Aturan dikembalikan ke default (10 potong per ekor)." : "Aturan disimpan. Berlaku untuk pembelian ayam berikutnya." });
    } catch (err) { setMsg({ kind: "error", text: (err as Error).message }); }
    finally { setBusy(false); setConfirm(null); }
  };

  return (
    <div className="max-w-xl space-y-5">
      <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Aturan Potongan Ayam</h1>
      <Notice kind="info">
        Atur berapa potong yang dihasilkan dari 1 ekor ayam. Perubahan hanya berlaku untuk pembelian ayam berikutnya;
        pembelian lama tetap memakai aturan saat transaksi dibuat.
      </Notice>

      <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="grid grid-cols-[1fr_8rem] items-center gap-x-4 gap-y-3 text-sm">
          <span className="font-medium text-gray-500">Produk</span>
          <span className="font-medium text-gray-500">Jumlah per ekor</span>
          {ROWS.map((r) => (
            <div key={r.key} className="contents">
              <label htmlFor={`conv-${r.key}`} className="text-base text-gray-800 dark:text-white/90">{r.label}</label>
              <Input id={`conv-${r.key}`} inputMode="numeric" value={draft[r.key]}
                onChange={(e) => { setMsg(null); setDraft({ ...draft, [r.key]: e.target.value.replace(/\D/g, "") }); }} />
            </div>
          ))}
        </div>
        <p className="border-t border-gray-100 pt-3 text-base font-semibold dark:border-gray-800">Total: {total} potong per ekor</p>
        <p className="text-sm text-gray-500">Contoh membeli 5 ekor: {ROWS.map((r) => `${r.label} +${5 * (Number(draft[r.key]) || 0)}`).join(", ")}.</p>
      </section>

      {invalid && <Notice kind="error">{invalid}</Notice>}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className="flex flex-wrap gap-3">
        <Button size="lg" disabled={!!invalid || !changed || busy} onClick={() => setConfirm("save")}>Simpan Perubahan</Button>
        <Button size="lg" variant="outline" disabled={busy} onClick={() => setConfirm("reset")}>Kembalikan ke Default</Button>
      </div>

      {confirm && (
        <Modal title={confirm === "save" ? "Simpan perubahan aturan?" : "Kembalikan ke default?"} onClose={() => setConfirm(null)}>
          <p className="mb-4 text-sm text-gray-600">
            {confirm === "save"
              ? `Total ${total} potong per ekor akan dipakai untuk pembelian ayam berikutnya. Pembelian lama tidak berubah.`
              : "Aturan menjadi Dada 4, Paha Atas 2, Paha Bawah 2, Sayap 2 (10 potong per ekor). Pembelian lama tidak berubah."}
          </p>
          <div className="flex gap-3">
            <Button size="lg" disabled={busy} onClick={apply}>{busy ? "Menyimpan..." : "Ya, Lanjutkan"}</Button>
            <Button size="lg" variant="outline" onClick={() => setConfirm(null)}>Batal</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
