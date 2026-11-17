// Helper fetch untuk komponen client. Pesan error selalu dalam Bahasa Indonesia.
export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}
export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? (res.status >= 500 ? "Server bermasalah. Periksa koneksi database lalu coba lagi." : "Gagal memuat data"));
  return body;
}

export async function apiSend<T>(
  url: string,
  data: unknown,
  opts: { method?: "POST" | "PUT"; idemKey?: string } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts.idemKey ? { "Idempotency-Key": opts.idemKey } : {}),
      },
      body: JSON.stringify(data),
    });
  } catch {
    throw new Error("Tidak dapat terhubung ke server. Coba lagi, data tidak akan tercatat dua kali.");
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) {
    const msg = body?.error ?? (res.status >= 500 ? "Server bermasalah. Periksa koneksi database lalu coba lagi." : "Gagal menyimpan data");
    throw new ApiError(msg, res.status, (body as { code?: string } | null)?.code);
  }
  return body;
}

/** Tanggal lokal format YYYY-MM-DD. */
export const todayISO = () => new Date().toLocaleDateString("sv-SE");

export const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

export const fmtDateTime = (ts: number) =>
  new Date(ts).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });

export function addDaysISO(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Unduh CSV (BOM agar terbaca benar di Excel). */
export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + body], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
