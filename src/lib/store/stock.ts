import { k, redis } from "@/lib/redis";
import { APPLY_STOCK_LUA } from "@/lib/domain/stock-script";
import { slugify } from "@/lib/domain/purchases";
import type { InventoryMeta } from "./catalog";
import { ensureSeed } from "./catalog";

export type StockStatus = "Tersedia" | "Stok Menipis" | "Habis";
export type InventoryRow = InventoryMeta & { stock: number; status: StockStatus };
export type MovementType =
  | "pembelian" | "penjualan" | "penyesuaian_masuk" | "penyesuaian_keluar"
  | "pembatalan_pembelian" | "pembatalan_penjualan";
export type StockMovement = {
  id: string; itemId: string; type: MovementType; qtyIn: number; qtyOut: number;
  stockAfter: number; ref: string; note?: string; ts: number; itemName?: string;
};

export const statusOf = (stock: number, min: number): StockStatus =>
  stock <= 0 ? "Habis" : stock <= min ? "Stok Menipis" : "Tersedia";

export async function listInventory(): Promise<InventoryRow[]> {
  await ensureSeed();
  const ids = (await redis.cmd<string[]>("SMEMBERS", k("inventory:index"))).sort();
  if (!ids.length) return [];
  const [metas, stocks] = await Promise.all([
    redis.cmd<(string | null)[]>("MGET", ...ids.map((id) => k("inventory_meta", id))),
    redis.cmd<(string | null)[]>("MGET", ...ids.map((id) => k("inventory", id))),
  ]);
  const rows: InventoryRow[] = [];
  metas.forEach((raw, i) => {
    if (!raw) return;
    const meta = JSON.parse(raw) as InventoryMeta;
    const stock = Number(stocks[i] ?? 0);
    rows.push({ ...meta, stock, status: statusOf(stock, meta.minStock) });
  });
  return rows;
}

/** Buat barang persediaan baru (bahan baku yang dilacak) bila belum ada. */
export async function ensureInventoryItem(name: string, unit: string, category = "Bahan Baku"): Promise<string> {
  const id = slugify(name);
  if (!id) throw new Error("Nama barang tidak valid");
  if (id === "nasi") throw new Error("Nasi tidak dilacak sebagai stok");
  const meta: InventoryMeta = { id, name: name.trim(), category, unit: unit.trim() || "pcs", minStock: 0 };
  await redis.cmd("SET", k("inventory_meta", id), JSON.stringify(meta), "NX");
  await redis.cmd("SET", k("inventory", id), "0", "NX");
  await redis.cmd("SADD", k("inventory:index"), id);
  return id;
}

type LuaOut =
  | { status: "ok"; recordId: string; number: string }
  | { status: "duplicate"; recordId: string }
  | { status: "insufficient"; itemId: string; have: number; need: number };

export type ApplyOutcome =
  | { ok: true; record: unknown; duplicate: boolean }
  | { ok: false; error: string; status: number };

export async function applyStock(p: {
  idemKey: string; seqName: string; recordPrefixName: string; numberPrefix: string;
  record: object; type: MovementType; note: string; deltas: Record<string, number>;
}): Promise<ApplyOutcome> {
  const entries = Object.entries(p.deltas).filter(([, d]) => d !== 0);
  const keys = [
    k("idempotency", p.recordPrefixName, p.idemKey), k("sequences", p.seqName),
    k(p.recordPrefixName + ":index"), k("stock_movements:index"),
    ...entries.map(([id]) => k("inventory", id)),
  ];
  const args = [
    Date.now(), k(p.recordPrefixName) + ":", JSON.stringify(p.record), k("stock_movements") + ":",
    p.numberPrefix, p.type, p.note,
    ...entries.map(([, d]) => d), ...entries.map(([id]) => id),
  ];
  const r = JSON.parse(await redis.eval<string>(APPLY_STOCK_LUA, keys, args)) as LuaOut;
  if (r.status === "insufficient") {
    const meta = await redis.get<InventoryMeta>(k("inventory_meta", r.itemId));
    return { ok: false, status: 409,
      error: `Stok ${meta?.name ?? r.itemId} tidak cukup (tersisa ${r.have}, dikurangi ${r.need})` };
  }
  return { ok: true, record: await redis.get(r.recordId), duplicate: r.status === "duplicate" };
}

export async function listMovements(offset = 0, limit = 100): Promise<StockMovement[]> {
  const ids = await redis.cmd<string[]>("ZREVRANGE", k("stock_movements:index"), offset, offset + limit - 1);
  if (!ids.length) return [];
  const raw = await redis.cmd<(string | null)[]>("MGET", ...ids);
  const moves = raw.filter((v): v is string => v != null).map((v) => JSON.parse(v) as StockMovement);
  const names = new Map<string, string>();
  for (const id of new Set(moves.map((m) => m.itemId))) {
    names.set(id, (await redis.get<InventoryMeta>(k("inventory_meta", id)))?.name ?? id);
  }
  return moves.map((m) => ({ ...m, itemName: names.get(m.itemId) }));
}
