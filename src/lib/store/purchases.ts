import { k, redis } from "@/lib/redis";
import {
  computeChickenPurchase, computeOtherPurchase, DEFAULT_CONVERSION, slugify,
  type ConversionRecipe,
} from "@/lib/domain/purchases";
import { applyStock, ensureInventoryItem, type ApplyOutcome } from "./stock";
import { ensureSeed } from "./catalog";

export async function getConversionRecipe(): Promise<ConversionRecipe> {
  return (await redis.get<ConversionRecipe>(k("settings", "conversion_recipe"))) ?? DEFAULT_CONVERSION;
}

type User = { id: string; name: string };

export async function createChickenPurchase(
  user: User,
  input: { date: string; supplier?: string; weightKg: number; birds: number; pricePerKg: number; note?: string },
  idemKey: string,
): Promise<ApplyOutcome> {
  await ensureSeed();
  const recipe = await getConversionRecipe(); // snapshot resep saat pembelian
  const calc = computeChickenPurchase(input, recipe);
  if (!calc.ok) return { ok: false, error: calc.error, status: 400 };
  const record = {
    id: "__ID__", number: "__NUMBER__", kind: "ayam", status: "selesai",
    date: input.date, supplier: input.supplier?.trim() ?? "", note: input.note?.trim() ?? "",
    weightKg: input.weightKg, birds: input.birds, pricePerKg: input.pricePerKg,
    total: calc.total, pieces: calc.pieces, recipeSnapshot: recipe,
    createdAt: Date.now(), createdBy: user.id, createdByName: user.name,
  };
  return applyStock({
    idemKey, seqName: "purchase", recordPrefixName: "purchases", numberPrefix: "PB",
    record, type: "pembelian", note: "Pembelian ayam", deltas: calc.pieces,
  });
}

export async function createOtherPurchase(
  user: User,
  input: { date: string; supplier?: string; name: string; unit: string; quantity: number;
           unitPrice: number; tracked: boolean; note?: string },
  idemKey: string,
): Promise<ApplyOutcome> {
  await ensureSeed();
  const calc = computeOtherPurchase(input);
  if (!calc.ok) return { ok: false, error: calc.error, status: 400 };
  let itemId: string | null = null;
  if (input.tracked) {
    try { itemId = await ensureInventoryItem(input.name, input.unit); }
    catch (e) { return { ok: false, error: (e as Error).message, status: 400 }; }
  }
  const record = {
    id: "__ID__", number: "__NUMBER__", kind: "lainnya", status: "selesai",
    date: input.date, supplier: input.supplier?.trim() ?? "", note: input.note?.trim() ?? "",
    name: input.name.trim(), unit: input.unit.trim(), quantity: input.quantity,
    unitPrice: input.unitPrice, total: calc.total, tracked: input.tracked, itemId: itemId ?? slugify(input.name),
    createdAt: Date.now(), createdBy: user.id, createdByName: user.name,
  };
  return applyStock({
    idemKey, seqName: "purchase", recordPrefixName: "purchases", numberPrefix: "PB",
    record, type: "pembelian", note: `Pembelian ${input.name.trim()}`,
    deltas: itemId ? { [itemId]: input.quantity } : {},
  });
}

export async function listPurchases(offset = 0, limit = 100) {
  const ids = await redis.cmd<string[]>("ZREVRANGE", k("purchases:index"), offset, offset + limit - 1);
  if (!ids.length) return [];
  const raw = await redis.cmd<(string | null)[]>("MGET", ...ids);
  return raw.filter((v): v is string => v != null).map((v) => JSON.parse(v));
}

export async function createAdjustment(
  user: User,
  input: { itemId: string; quantity: number; direction: "masuk" | "keluar"; reason: string; date: string },
  idemKey: string,
): Promise<ApplyOutcome> {
  await ensureSeed();
  const exists = await redis.cmd("SISMEMBER", k("inventory:index"), input.itemId);
  if (!exists) return { ok: false, error: "Barang tidak ditemukan", status: 404 };
  const delta = input.direction === "masuk" ? input.quantity : -input.quantity;
  const record = {
    id: "__ID__", number: "__NUMBER__", itemId: input.itemId, direction: input.direction,
    quantity: input.quantity, reason: input.reason.trim(), date: input.date,
    createdAt: Date.now(), createdBy: user.id, createdByName: user.name,
  };
  return applyStock({
    idemKey, seqName: "adjustment", recordPrefixName: "adjustments", numberPrefix: "ADJ",
    record, type: input.direction === "masuk" ? "penyesuaian_masuk" : "penyesuaian_keluar",
    note: input.reason.trim(), deltas: { [input.itemId]: delta },
  });
}
