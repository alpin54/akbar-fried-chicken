import { z } from "zod";
import { json, requireAuth } from "@/lib/api";
import { changePassword } from "@/lib/auth/session";

const body = z.object({ current: z.string().min(1), next: z.string().min(8).max(100) });

export async function POST(req: Request) {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Password baru minimal 8 karakter" }, 400);
  const err = await changePassword(user.id, parsed.data.current, parsed.data.next);
  return err ? json({ error: err }, 400) : json({ ok: true });
}
