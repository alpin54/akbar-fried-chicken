"use client";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { apiGet, apiSend } from "@/lib/client";
import { useCallback, useEffect, useState } from "react";

type Item = { id: string; name: string };

export default function MasterList({ type, title, singular }: { type: "categories" | "units"; title: string; singular: string }) {
  const [rows, setRows] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows((await apiGet<{ items: Item[] }>(`/api/master/${type}`)).items); }
    catch (e) { setMsg({ kind: "error", text: (e as Error).message }); }
    finally { setLoading(false); }
  }, [type]);
  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setMsg({ kind: "error", text: `Isi nama ${singular}.` }); return; }
    setBusy(true);
    try {
      await apiSend(`/api/master/${type}`, { name });
      setName(""); setMsg({ kind: "success", text: `${singular} ditambahkan.` }); await load();
    } catch (err) { setMsg({ kind: "error", text: (err as Error).message }); }
    finally { setBusy(false); }
  };

  const del = async (item: Item) => {
    if (!window.confirm(`Hapus ${singular} "${item.name}"?`)) return;
    const res = await fetch(`/api/master/${type}/${item.id}`, { method: "DELETE" });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) setMsg({ kind: "error", text: body?.error ?? "Gagal menghapus" });
    else { setMsg({ kind: "success", text: `${singular} dihapus.` }); await load(); }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">{title}</h1>
      <form onSubmit={add} className="flex max-w-md gap-3">
        <Input placeholder={`Nama ${singular} baru`} value={name} onChange={(e) => { setName(e.target.value); setMsg(null); }} aria-label={`Nama ${singular}`} />
        <Button type="submit" size="lg" disabled={busy}>Tambah</Button>
      </form>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <DataTable<Item> rows={rows} rowKey={(r) => r.id} loading={loading} emptyText={`Belum ada ${singular}.`}
        searchText={(r) => r.name} searchPlaceholder={`Cari ${singular}...`}
        columns={[
          { key: "n", header: "Nama", cell: (r) => r.name, sortValue: (r) => r.name },
          { key: "a", header: "", cell: (r) => <Button size="xs" variant="ghost" className="text-red-600" onClick={() => del(r)}>Hapus</Button> },
        ]} />
    </div>
  );
}
