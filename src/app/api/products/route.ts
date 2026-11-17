import { z } from "zod";
import { json, requireAuth } from "@/lib/api";
import { getCatalog } from "@/lib/store/catalog";
import { createProduct } from "@/lib/store/products";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  const all = new URL(req.url).searchParams.get("all") === "1";
  const products = (await getCatalog()).filter((p) => all || p.active);
  return json({ products });
}

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

export async function POST(req: Request) {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Data produk tidak valid" }, 400);
  const { confirmDisableStock: _c, ...input } = parsed.data;
  const out = await createProduct(input);
  return out.ok ? json({ product: out.product }, 201) : json({ error: out.error }, out.status);
}
