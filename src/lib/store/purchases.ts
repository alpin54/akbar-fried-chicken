import { k, redis } from "@/lib/redis";
import {
  buildChickenPurchase, computeOtherPurchase, DEFAULT_CONVERSION, slugify,
  type ChickenPurchaseInput, type ConversionRecipe,
} from "@/lib/domain/purchases";
import type { MenuProduct } from "@/lib/domain/sales";
import { applyStock, ensureInventoryItem, type ApplyOutcome } from "./stock";
import { ensureSeed } from "./catalog";

export async function getConversionRecipe(): Promise<ConversionRecipe> {
  return (await redis.get<ConversionRecipe>(k("settings", "conversion_recipe"))) ?? DEFAULT_CONVERSION;
}

type User = { id: string; name: string };

export async function createChickenPurchase(
  user: User, input: ChickenPurchaseInput, idemKey: string,
): Promise<ApplyOutcome> {
  await ensureSeed();
  // Aturan global hanya dibaca (sebagai default). Tidak pernah diubah oleh pembelian.
  const built = buildChickenPurchase(input, await getConversionRecipe(), { user, now: Date.now() });
  if (!built.ok) return { ok: false, error: built.error, status: 400 };
  // Hanya Dada, Paha Atas, Paha Bawah, Sayap yang bertambah. Ati Ampela/Kepala/Ceker tidak ikut konversi.
  return applyStock({
    idemKey, seqName: "purchase", recordName: "purchases", numberPrefix: "PB", record: built.record,
    type: "pembelian", note: "Pembelian ayam", deltas: built.deltas, actorId: user.id, payload: input,
  });
}

export async function createOtherPurchase(
  user: User,
  input: { date: string; supplier?: string; name: string; unit: string; quantity: number; unitPrice: number;
           tracked: boolean; productId?: string; note?: string },
  idemKey: string,
): Promise<ApplyOutcome> {
  await ensureSeed();
  const calc = computeOtherPurchase(input);
  if (!calc.ok) return { ok: false, error: calc.error, status: 400 };

  let itemId: string | null = null;
  let name = input.name.trim();
  let unit = input.unit.trim();
  if (input.productId) {
    // Pembelian untuk produk Dengan Stok (mis. Ati Ampela, Kepala, Ceker): menambah inventori produk itu.
    const product = await redis.get<MenuProduct>(k("products", input.productId));
    if (!product) return { ok: false, status: 404, error: "Produk tidak ditemukan" };
    if (!product.trackStock) return { ok: false, status: 409, error: `${product.name} diatur Tanpa Stok, tidak bisa menerima stok` };
    itemId = product.id; name = product.name; unit = product.unit ?? unit;
  } else if (input.tracked) {
    try { itemId = await ensureInventoryItem(name, unit); }
    catch (e) { return { ok: false, error: (e as Error).message, status: 400 }; }
  }
  const record = {
    id: "__ID__", number: "__NUMBER__", kind: "lainnya", status: "selesai",
    date: input.date, supplier: input.supplier?.trim() ?? "", note: input.note?.trim() ?? "",
    name, unit, quantity: input.quantity, unitPrice: input.unitPrice, total: calc.total,
    tracked: itemId !== null, productId: input.productId ?? null, itemId: itemId ?? slugify(name),
    stockIn: itemId ? { [itemId]: input.quantity } : {},
    createdAt: Date.now(), createdBy: user.id, createdByName: user.name,
  };
  return applyStock({
    idemKey, seqName: "purchase", recordName: "purchases", numberPrefix: "PB", record,
    type: "pembelian", note: `Pembelian ${name}`, deltas: itemId ? { [itemId]: input.quantity } : {},
    actorId: user.id, payload: input,
  });
}

export async function listPurchases(offset = 0, limit = 100) {
  const keys = await redis.cmd<string[]>("ZREVRANGE", k("purchases:index"), offset, offset + limit - 1);
  if (!keys.length) return [];
  const [raw, cancels] = await Promise.all([
    redis.cmd<(string | null)[]>("MGET", ...keys),
    redis.cmd<(string | null)[]>("MGET", ...keys.map((key) => key.replace(k("purchases") + ":", k("purchases_cancel") + ":"))),
  ]);
  const out: Record<string, unknown>[] = [];
  raw.forEach((v, i) => {
    if (v == null) return;
    const rec = JSON.parse(v) as Record<string, unknown>;
    out.push(cancels[i] ? { ...rec, status: "dibatalkan", cancellation: JSON.parse(cancels[i] as string) } : rec);
  });
  return out;
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
    idemKey, seqName: "adjustment", recordName: "adjustments", numberPrefix: "ADJ", record,
    type: input.direction === "masuk" ? "penyesuaian_masuk" : "penyesuaian_keluar",
    note: input.reason.trim(), deltas: { [input.itemId]: delta }, actorId: user.id, payload: input,
  });
}
