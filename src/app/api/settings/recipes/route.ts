import { z } from "zod";
import { json, requireAdmin, requireAuth } from "@/lib/api";
import { k, redis } from "@/lib/redis";
import { validateConversion } from "@/lib/domain/purchases";
import { DEFAULT_CONVERSION } from "@/lib/domain/seed";
import { getSaleRecipe } from "@/lib/store/catalog";
import { getConversionRecipe } from "@/lib/store/purchases";

export async function GET() {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  const [conversion, sale] = await Promise.all([getConversionRecipe(), getSaleRecipe()]);
  return json({ conversion, sale, defaultConversion: DEFAULT_CONVERSION });
}

const conversion = z.object({
  dada: z.number().int(), paha_atas: z.number().int(),
  paha_bawah: z.number().int(), sayap: z.number().int(),
});
const body = z.union([
  z.object({ resetConversion: z.literal(true) }),
  z.object({
    conversion: conversion.optional(),
    sale: z.object({ sambalPerPortion: z.number().int().min(0).max(20) }).optional(),
  }).refine((b) => b.conversion || b.sale, "Tidak ada perubahan"),
]);

// Perubahan hanya berlaku untuk transaksi baru: transaksi lama menyimpan snapshot sendiri.
export async function PUT(req: Request) {
  const user = await requireAdmin();
  if (user instanceof Response) return user;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Data aturan tidak valid" }, 400);

  const before = { conversion: await getConversionRecipe(), sale: await getSaleRecipe() };
  const data = parsed.data;
  let nextConversion = before.conversion;
  let nextSale = before.sale;

  if ("resetConversion" in data) {
    nextConversion = { ...DEFAULT_CONVERSION };
  } else {
    if (data.conversion) {
      const bad = validateConversion(data.conversion);
      if (bad) return json({ error: bad }, 400);
      nextConversion = data.conversion;
    }
    if (data.sale) nextSale = data.sale;
  }
  await redis.set(k("settings", "conversion_recipe"), nextConversion);
  await redis.set(k("settings", "sale_recipe"), nextSale);

  const ts = Date.now();
  const id = `${ts}-${Math.random().toString(36).slice(2, 6)}`;
  await redis.set(k("activity_logs", id), {
    id, ts, userId: user.id, userName: user.name,
    action: "resetConversion" in data ? "reset_aturan_potongan" : "ubah_aturan",
    before, after: { conversion: nextConversion, sale: nextSale },
  });
  await redis.cmd("ZADD", k("activity_logs:index"), ts, k("activity_logs", id));
  return json({ ok: true, conversion: nextConversion, sale: nextSale });
}
