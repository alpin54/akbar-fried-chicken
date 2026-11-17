import { z } from "zod";
import { idemKey, json, requireAuth } from "@/lib/api";
import { createChickenPurchase } from "@/lib/store/purchases";

const body = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  supplier: z.string().max(100).optional(),
  weightKg: z.number().positive().max(100000),
  birds: z.number().int().min(1).max(100000),
  pricePerKg: z.number().int().min(1).max(100_000_000),
  note: z.string().max(300).optional(),
});

export async function POST(req: Request) {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  const key = idemKey(req);
  if (key instanceof Response) return key;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Data pembelian tidak valid" }, 400);
  const out = await createChickenPurchase(user, parsed.data, key);
  return out.ok ? json({ purchase: out.record, duplicate: out.duplicate }, out.duplicate ? 200 : 201)
                : json({ error: out.error }, out.status);
}
