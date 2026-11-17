import { z } from "zod";
import { json, requireAuth } from "@/lib/api";
import { updateProfile } from "@/lib/auth/session";

export async function PUT(req: Request) {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  const parsed = z.object({ name: z.string().trim().min(1).max(60) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Nama wajib diisi" }, 400);
  await updateProfile(user.id, parsed.data.name);
  return json({ ok: true });
}
