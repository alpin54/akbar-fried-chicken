"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import type { Report } from "@/lib/domain/reports";
import { addDaysISO, apiGet, todayISO } from "@/lib/client";
import type { ExpenseRow, PurchaseRow, SaleRow } from "@/lib/store/reports";
import { useEffect, useState } from "react";

export type ReportData = {
  report: Report; salesRows: SaleRow[]; purchaseRows: PurchaseRow[]; expenseRows: ExpenseRow[];
};

/** Kerangka laporan: judul, filter periode, pemuatan data. */
export default function ReportShell({ title, children, actions }: {
  title: string;
  children: (d: ReportData) => React.ReactNode;
  actions?: (d: ReportData) => React.ReactNode;
}) {
  const today = todayISO();
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  // Hasil permintaan ditandai dengan periodenya; "loading" dan "error periode" diturunkan saat render.
  const [state, setState] = useState<{ key: string; data: ReportData | null; error: string | null }>({
    key: "", data: null, error: null,
  });
  const key = `${from}|${to}`;
  const invalid = !from || !to || from > to;

  useEffect(() => {
    if (invalid) return;
    let cancelled = false;
    apiGet<ReportData>(`/api/reports?from=${from}&to=${to}`)
      .then((d) => { if (!cancelled) setState({ key, data: d, error: null }); })
      .catch((e: Error) => { if (!cancelled) setState((prev) => ({ key, data: prev.data, error: e.message })); });
    return () => { cancelled = true; };
  }, [from, to, key, invalid]);

  const data = state.data;
  const loading = !invalid && state.key !== key;
  const error = invalid ? "Tanggal awal harus sebelum tanggal akhir." : state.key === key ? state.error : null;

  const preset = (a: string, b: string) => { setFrom(a); setTo(b); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">{title}</h1>
        {data && actions?.(data)}
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
        <Button size="xs" variant="outline" onClick={() => preset(today, today)}>Hari Ini</Button>
        <Button size="xs" variant="outline" onClick={() => preset(addDaysISO(today, -6), today)}>7 Hari</Button>
        <Button size="xs" variant="outline" onClick={() => preset(addDaysISO(today, -29), today)}>30 Hari</Button>
        <Button size="xs" variant="outline" onClick={() => preset(today.slice(0, 8) + "01", today)}>Bulan Ini</Button>
        <label className="ml-auto flex items-center gap-2 text-sm text-gray-500">Dari
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></label>
        <label className="flex items-center gap-2 text-sm text-gray-500">Sampai
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></label>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {loading && !data && <p className="text-sm text-gray-500">Memuat laporan...</p>}
      {data && <div className={loading ? "opacity-60" : ""}>{children(data)}</div>}
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold text-gray-900 dark:text-white ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold text-gray-800 dark:text-white/90">{title}</h2>
      {children}
    </section>
  );
}
