import { z } from "zod";
import { json, requireAuth } from "@/lib/api";
import { createMaster, isMasterType, listMaster } from "@/lib/store/master";

type Ctx = { params: Promise<{ type: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  const { type } = await ctx.params;
  if (!isMasterType(type)) return json({ error: "Jenis data tidak dikenal" }, 404);
  return json({ items: await listMaster(type) });
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  const { type } = await ctx.params;
  if (!isMasterType(type)) return json({ error: "Jenis data tidak dikenal" }, 404);
  const parsed = z.object({ name: z.string().trim().min(1).max(40) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Nama wajib diisi" }, 400);
  const out = await createMaster(type, parsed.data.name);
  return typeof out === "string" ? json({ error: out }, 400) : json({ item: out }, 201);
}
