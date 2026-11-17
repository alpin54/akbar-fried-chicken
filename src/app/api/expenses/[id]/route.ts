import { z } from "zod";
import { json, requireAuth } from "@/lib/api";
import { deleteExpense, updateExpense } from "@/lib/store/expenses";

const body = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(100),
  quantity: z.number().int().min(1).max(100000),
  amount: z.number().int().min(0).max(1_000_000_000),
  note: z.string().max(300).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return json({ error: "ID tidak valid" }, 400);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Data pengeluaran tidak valid" }, 400);
  const out = await updateExpense(user, id, parsed.data);
  return out ? json({ expense: out }) : json({ error: "Pengeluaran tidak ditemukan" }, 404);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return json({ error: "ID tidak valid" }, 400);
  return (await deleteExpense(user, id)) ? json({ ok: true }) : json({ error: "Pengeluaran tidak ditemukan" }, 404);
}
