"use client";

import { Labeled } from "@/components/shared/labeled";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { apiGet, apiSend } from "@/lib/client";
import { useEffect, useState } from "react";

export default function RecipeForm() {
  const [sambal, setSambal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    apiGet<{ sale: { sambalPerPortion: number } }>("/api/settings/recipes")
      .then((d) => setSambal(String(d.sale.sambalPerPortion)))
      .catch((e: Error) => setMsg({ kind: "error", text: e.message }));
  }, []);
  if (sambal === null) return msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : <p className="text-sm text-gray-500">Memuat...</p>;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sambal === "") { setMsg({ kind: "error", text: "Isi jumlah sambal per porsi." }); return; }
    setBusy(true);
    try {
      await apiSend("/api/settings/recipes", { sale: { sambalPerPortion: Number(sambal) } }, { method: "PUT" });
      setMsg({ kind: "success", text: "Resep disimpan. Berlaku untuk penjualan berikutnya." });
    } catch (err) { setMsg({ kind: "error", text: (err as Error).message }); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={save} noValidate className="max-w-xl space-y-5">
      <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Pengaturan Resep</h1>
      <Notice kind="info">Perubahan hanya berlaku untuk penjualan berikutnya. Transaksi lama tidak berubah. Aturan potongan ayam ada di menu Aturan Potongan Ayam.</Notice>
      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-white/90">Sambal</h2>
          <p className="text-sm text-gray-500">Dipakai Ayam Geprek dan Ayam Geprek + Nasi. Ayam + Nasi dan Nasi tidak memakai sambal.</p>
        </div>
        <Labeled label="Sambal per 1 porsi menu">
          <Input inputMode="numeric" value={sambal} onChange={(e) => { setMsg(null); setSambal(e.target.value.replace(/\D/g, "")); }} />
        </Labeled>
      </section>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <Button type="submit" size="lg" disabled={busy}>{busy ? "Menyimpan..." : "Simpan Resep"}</Button>
    </form>
  );
}
