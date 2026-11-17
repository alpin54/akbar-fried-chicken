import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { ensureSeed } from "@/lib/store/catalog";

export const json = (data: unknown, status = 200) => Response.json(data, { status });

/**
 * Pastikan data awal tersedia dan pengguna login.
 * Masalah Redis/seeding dikembalikan sebagai JSON 503 dengan pesan yang jelas.
 */
export async function requireAuth(): Promise<SessionUser | Response> {
  try {
    await ensureSeed();
    return (await getSessionUser()) ?? json({ error: "Belum login" }, 401);
  } catch (e) {
    console.error("[api] kegagalan database/inisialisasi:", e);
    return json({ error: e instanceof Error ? e.message : "Database tidak dapat dihubungi" }, 503);
  }
}

/** Khusus admin (pengaturan sensitif seperti aturan potongan ayam). */
export async function requireAdmin(): Promise<SessionUser | Response> {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  return user.role === "admin" ? user : json({ error: "Hanya admin yang boleh mengubah ini" }, 403);
}

/** Ambil Idempotency-Key valid dari header, atau Response 400. */
export function idemKey(req: Request): string | Response {
  const key = req.headers.get("idempotency-key");
  return key && /^[\w-]{8,64}$/.test(key) ? key : json({ error: "Idempotency-Key tidak valid" }, 400);
}
