import { z } from "zod";
import { json, requireAuth } from "@/lib/api";
import { k, redis } from "@/lib/redis";
import type { InventoryMeta } from "@/lib/store/catalog";

// Mengatur stok minimum. Perubahan stok tetap hanya lewat pembelian/penjualan/penyesuaian.
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const parsed = z.object({ minStock: z.number().int().min(0).max(1_000_000) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Stok minimum tidak valid" }, 400);
  const meta = await redis.get<InventoryMeta>(k("inventory_meta", id));
  if (!meta) return json({ error: "Barang tidak ditemukan" }, 404);
  await redis.set(k("inventory_meta", id), { ...meta, minStock: parsed.data.minStock });
  return json({ ok: true });
}
