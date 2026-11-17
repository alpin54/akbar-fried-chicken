import { z } from "zod";
import { requireAuth } from "@/lib/api";
import { CHICKEN_PARTS } from "@/lib/domain/sales";
import { createSale, listSales } from "@/lib/store/sales";

const body = z.object({
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().int().min(1).max(999),
    variant: z.enum(CHICKEN_PARTS).optional(),
  })).min(1).max(100),
  received: z.number().int().min(0).max(1_000_000_000),
});

export async function POST(req: Request) {
  const user = await requireAuth();
  if (user instanceof Response) return user;

  const key = req.headers.get("idempotency-key");
  if (!key || !/^[\w-]{8,64}$/.test(key))
    return Response.json({ error: "Idempotency-Key tidak valid" }, { status: 400 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data penjualan tidak valid" }, { status: 400 });

  const out = await createSale(user, parsed.data, key);
  if (!out.ok) return Response.json({ error: out.error }, { status: out.status });
  return Response.json({ sale: out.sale, duplicate: out.duplicate }, { status: out.duplicate ? 200 : 201 });
}

export async function GET(req: Request) {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  const u = new URL(req.url);
  const offset = Math.max(0, Number(u.searchParams.get("offset")) || 0);
  const limit = Math.min(100, Math.max(1, Number(u.searchParams.get("limit")) || 50));
  return Response.json({ sales: await listSales(offset, limit) });
}
