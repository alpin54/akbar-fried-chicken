import { ensureSeed } from "@/lib/store/catalog";
import { ensureAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// Cek kesiapan: koneksi Redis + data awal + akun admin. Tidak membuka data sensitif.
export async function GET() {
  try {
    await ensureSeed();
    await ensureAdmin();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Gagal" }, { status: 503 });
  }
}
