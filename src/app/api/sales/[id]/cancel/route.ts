import { z } from "zod";
import { json, requireAuth } from "@/lib/api";
import { cancelSale } from "@/lib/store/sales";

const body = z.object({ reason: z.string().trim().min(3).max(200) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return json({ error: "ID tidak valid" }, 400);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Alasan pembatalan wajib diisi" }, 400);
  const out = await cancelSale(user, id, parsed.data.reason);
  return out.ok ? json({ ok: true }) : json({ error: out.error }, out.status);
}
