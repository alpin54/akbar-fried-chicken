import { z } from "zod";
import { idemKey, json, requireAuth } from "@/lib/api";
import { createAdjustment } from "@/lib/store/purchases";

const body = z.object({
  itemId: z.string().min(1).max(60),
  quantity: z.number().int().min(1).max(1_000_000),
  direction: z.enum(["masuk", "keluar"]),
  reason: z.string().trim().min(3).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: Request) {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  const key = idemKey(req);
  if (key instanceof Response) return key;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Data penyesuaian tidak valid (alasan wajib diisi)" }, 400);
  const out = await createAdjustment(user, parsed.data, key);
  return out.ok ? json({ adjustment: out.record, duplicate: out.duplicate }, out.duplicate ? 200 : 201)
                : json({ error: out.error }, out.status);
}
