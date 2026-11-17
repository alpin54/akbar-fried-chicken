import { z } from "zod";
import { idemKey, json, requireAuth } from "@/lib/api";
import { createOtherPurchase } from "@/lib/store/purchases";

const body = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  supplier: z.string().max(100).optional(),
  name: z.string().trim().min(1).max(80),
  unit: z.string().trim().min(1).max(20),
  quantity: z.number().int().min(1).max(1_000_000),
  unitPrice: z.number().int().min(0).max(100_000_000),
  tracked: z.boolean(),
  productId: z.string().regex(/^[a-z0-9_]+$/).max(60).optional(),
  note: z.string().max(300).optional(),
});

export async function POST(req: Request) {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  const key = idemKey(req);
  if (key instanceof Response) return key;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Data pembelian tidak valid" }, 400);
  const out = await createOtherPurchase(user, parsed.data, key);
  return out.ok ? json({ purchase: out.record, duplicate: out.duplicate }, out.duplicate ? 200 : 201)
                : json({ error: out.error }, out.status);
}
