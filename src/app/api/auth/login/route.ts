import { z } from "zod";
import { login, setSessionCookie } from "@/lib/auth/session";

const schema = z.object({ username: z.string().min(1), password: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Isi username dan password" }, { status: 400 });
  let token: string | null;
  try {
    token = await login(parsed.data.username, parsed.data.password);
  } catch (e) {
    console.error("[login] database tidak dapat dihubungi:", e);
    return Response.json({ error: "Database tidak dapat dihubungi. Periksa konfigurasi Redis lalu coba lagi." }, { status: 503 });
  }
  if (!token) return Response.json({ error: "Username atau password salah" }, { status: 401 });
  await setSessionCookie(token);
  return Response.json({ ok: true });
}
