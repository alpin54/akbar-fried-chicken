import { z } from "zod";
import { json, requireAuth } from "@/lib/api";
import { updateProduct } from "@/lib/store/products";

const body = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().max(30).optional(),
  categoryId: z.string().regex(/^[a-z0-9_]+$/).max(60),
  unit: z.string().trim().max(20).optional(),
  buyPrice: z.number().int().min(0).max(100_000_000).optional(),
  price: z.number().int().min(0).max(100_000_000),
  active: z.boolean(),
  trackStock: z.boolean(),
  usesChicken: z.boolean(),
  usesSambal: z.boolean(),
  confirmDisableStock: z.boolean().optional(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  if (!/^[a-z0-9_]+$/.test(id)) return json({ error: "ID tidak valid" }, 400);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Data produk tidak valid" }, 400);
  const { confirmDisableStock, ...input } = parsed.data;
  const out = await updateProduct(id, input, confirmDisableStock === true);
  if (out.ok) return json({ product: out.product });
  return json({ error: out.error, code: out.code, balance: out.balance, movements: out.movements }, out.status);
}
