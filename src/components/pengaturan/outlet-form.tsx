"use client";

import { Labeled } from "@/components/shared/labeled";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { apiGet, apiSend } from "@/lib/client";
import { useEffect, useState } from "react";

type Outlet = { name: string; address: string; phone: string; logoUrl: string };

export default function OutletForm() {
  const [f, setF] = useState<Outlet | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    apiGet<{ outlet: Outlet }>("/api/settings/outlet").then((d) => setF(d.outlet)).catch((e: Error) => setMsg({ kind: "error", text: e.message }));
  }, []);
  if (!f) return msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : <p className="text-sm text-gray-500">Memuat...</p>;

  const set = (k: keyof Outlet) => (e: React.ChangeEvent<HTMLInputElement>) => { setMsg(null); setF({ ...f, [k]: e.target.value }); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await apiSend("/api/settings/outlet", f, { method: "PUT" }); setMsg({ kind: "success", text: "Pengaturan outlet disimpan." }); }
    catch (err) { setMsg({ kind: "error", text: (err as Error).message }); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={save} noValidate className="max-w-xl space-y-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Pengaturan Outlet</h1>
      <Labeled label="Nama outlet"><Input value={f.name} onChange={set("name")} /></Labeled>
      <Labeled label="Alamat"><Input value={f.address} onChange={set("address")} /></Labeled>
      <Labeled label="Nomor telepon"><Input inputMode="tel" value={f.phone} onChange={set("phone")} /></Labeled>
      <Labeled label="Alamat gambar logo (https://...)"><Input value={f.logoUrl} onChange={set("logoUrl")} placeholder="Boleh dikosongkan" /></Labeled>
      {f.logoUrl.startsWith("https://") && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={f.logoUrl} alt="Pratinjau logo" className="h-16 w-auto rounded-lg border border-gray-200" />
      )}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <Button type="submit" size="lg" disabled={busy}>{busy ? "Menyimpan..." : "Simpan"}</Button>
    </form>
  );
}
