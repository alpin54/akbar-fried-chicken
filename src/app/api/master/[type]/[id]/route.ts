import { json, requireAuth } from "@/lib/api";
import { deleteMaster, isMasterType } from "@/lib/store/master";

export async function DELETE(_req: Request, ctx: { params: Promise<{ type: string; id: string }> }) {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  const { type, id } = await ctx.params;
  if (!isMasterType(type) || !/^[a-z0-9_]+$/.test(id)) return json({ error: "Permintaan tidak valid" }, 400);
  const err = await deleteMaster(type, id);
  return err ? json({ error: err }, 409) : json({ ok: true });
}
