import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { k, redis } from "@/lib/redis";
import { hashPassword, verifyPassword } from "./password";

export const COOKIE = "fc_session";
const TTL = 60 * 60 * 24 * 7; // 7 hari

export type SessionUser = { id: string; name: string; username: string; role: "admin" | "staff" };
type StoredUser = SessionUser & { passwordHash: string };
type Session = { userId: string; createdAt: number };

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const norm = (u: string) => u.trim().toLowerCase();

/** Buat akun admin awal dari env bila belum ada (tidak menimpa yang sudah ada). */
export async function ensureAdmin(): Promise<void> {
  const username = norm(process.env.ADMIN_USERNAME ?? "");
  const pw = process.env.ADMIN_INITIAL_PASSWORD;
  if (!username || !pw) return;
  if (await redis.cmd("GET", k("users:username", username))) return;
  const id = "u_" + randomBytes(8).toString("hex");
  const user: StoredUser = {
    id, username, role: "admin",
    name: process.env.ADMIN_NAME ?? "Admin",
    passwordHash: await hashPassword(pw),
  };
  // NX: aman bila dua request mengakses bersamaan
  const ok = await redis.cmd("SET", k("users:username", username), id, "NX");
  if (ok) await redis.set(k("users", id), user);
}

export async function login(username: string, password: string): Promise<string | null> {
  await ensureAdmin();
  const id = await redis.cmd<string | null>("GET", k("users:username", norm(username)));
  const user = id ? await redis.get<StoredUser>(k("users", id)) : null;
  // verifikasi tetap dijalankan untuk mengurangi timing leak
  const ok = await verifyPassword(password, user?.passwordHash ?? "scrypt$00$00");
  if (!user || !ok) return null;
  const token = randomBytes(32).toString("hex");
  await redis.cmd("SET", k("sessions", sha(token)), JSON.stringify({ userId: user.id, createdAt: Date.now() } satisfies Session), "EX", TTL);
  return token;
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: TTL,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await redis.cmd("DEL", k("sessions", sha(token)));
  jar.delete(COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const s = await redis.get<Session>(k("sessions", sha(token)));
  if (!s) return null;
  const u = await redis.get<StoredUser>(k("users", s.userId));
  if (!u) return null;
  // Jangan pernah mengembalikan hash password ke pemanggil.
  return { id: u.id, name: u.name, username: u.username, role: u.role };
}

/** Untuk API route: kembalikan user atau null (caller balas 401). */
export const requireUser = getSessionUser;

export async function updateProfile(userId: string, name: string): Promise<void> {
  const u = await redis.get<StoredUser>(k("users", userId));
  if (u) await redis.set(k("users", userId), { ...u, name: name.trim() });
}

/** Mengembalikan pesan error, atau null bila berhasil. */
export async function changePassword(userId: string, current: string, next: string): Promise<string | null> {
  const u = await redis.get<StoredUser>(k("users", userId));
  if (!u) return "Akun tidak ditemukan";
  if (!(await verifyPassword(current, u.passwordHash))) return "Password saat ini salah";
  await redis.set(k("users", userId), { ...u, passwordHash: await hashPassword(next) });
  return null;
}
