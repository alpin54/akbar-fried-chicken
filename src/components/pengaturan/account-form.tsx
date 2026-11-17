"use client";

import { Labeled } from "@/components/shared/labeled";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { apiGet, apiSend } from "@/lib/client";
import { useEffect, useState } from "react";

type Msg = { kind: "success" | "error"; text: string } | null;

export default function AccountForm() {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [profileMsg, setProfileMsg] = useState<Msg>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet<{ user: { name: string; username: string } }>("/api/auth/me")
      .then((d) => { setName(d.user.name); setUsername(d.user.username); })
      .catch((e: Error) => setProfileMsg({ kind: "error", text: e.message }));
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await apiSend("/api/account", { name }, { method: "PUT" }); setProfileMsg({ kind: "success", text: "Profil disimpan." }); }
    catch (err) { setProfileMsg({ kind: "error", text: (err as Error).message }); }
    finally { setBusy(false); }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) { setPwMsg({ kind: "error", text: "Password baru minimal 8 karakter." }); return; }
    if (next !== confirm) { setPwMsg({ kind: "error", text: "Konfirmasi password tidak sama." }); return; }
    setBusy(true);
    try {
      await apiSend("/api/account/password", { current, next });
      setCurrent(""); setNext(""); setConfirm("");
      setPwMsg({ kind: "success", text: "Password berhasil diubah." });
    } catch (err) { setPwMsg({ kind: "error", text: (err as Error).message }); }
    finally { setBusy(false); }
  };

  const card = "max-w-xl space-y-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900";
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Pengaturan Akun</h1>
      <form onSubmit={saveProfile} noValidate className={card}>
        <h2 className="font-semibold text-gray-800 dark:text-white/90">Profil</h2>
        <Labeled label="Username"><Input value={username} disabled readOnly /></Labeled>
        <Labeled label="Nama"><Input value={name} onChange={(e) => { setName(e.target.value); setProfileMsg(null); }} /></Labeled>
        {profileMsg && <Notice kind={profileMsg.kind}>{profileMsg.text}</Notice>}
        <Button type="submit" size="lg" disabled={busy}>Simpan Profil</Button>
      </form>
      <form onSubmit={savePassword} noValidate className={card}>
        <h2 className="font-semibold text-gray-800 dark:text-white/90">Ubah Password</h2>
        <Labeled label="Password saat ini"><Input type="password" autoComplete="current-password" value={current} onChange={(e) => { setCurrent(e.target.value); setPwMsg(null); }} /></Labeled>
        <Labeled label="Password baru (minimal 8 karakter)"><Input type="password" autoComplete="new-password" value={next} onChange={(e) => { setNext(e.target.value); setPwMsg(null); }} /></Labeled>
        <Labeled label="Ulangi password baru"><Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setPwMsg(null); }} /></Labeled>
        {pwMsg && <Notice kind={pwMsg.kind}>{pwMsg.text}</Notice>}
        <Button type="submit" size="lg" disabled={busy}>Ubah Password</Button>
      </form>
    </div>
  );
}
