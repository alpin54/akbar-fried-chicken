import { k, redis } from "@/lib/redis";
import { APPLY_STOCK_LUA, buildApplyCall } from "@/lib/domain/stock-script";
import { payloadHash } from "@/lib/domain/idempotency";
import { slugify } from "@/lib/domain/purchases";
import type { MenuProduct } from "@/lib/domain/sales";
import { ensureSeed, type InventoryMeta } from "./catalog";

export type StockStatus = "Tersedia" | "Stok Menipis" | "Habis";
export type InventoryRow = InventoryMeta & { stock: number; status: StockStatus };
export type MovementType =
  | "pembelian" | "penjualan" | "penyesuaian_masuk" | "penyesuaian_keluar"
  | "pembatalan_pembelian" | "pembatalan_penjualan";
export type StockMovement = {
  id: string; itemId: string; productId?: string; type: MovementType; qtyIn: number; qtyOut: number;
  balanceBefore?: number; stockAfter: number; ref: string; transactionId?: string; reversalOf?: string;
  note?: string; actorId?: string; ts: number; itemName?: string;
};

export const statusOf = (stock: number, min: number): StockStatus =>
  stock <= 0 ? "Habis" : stock <= min ? "Stok Menipis" : "Tersedia";

async function getProducts(ids: string[]): Promise<Map<string, MenuProduct>> {
  const map = new Map<string, MenuProduct>();
  if (!ids.length) return map;
  const raw = await redis.cmd<(string | null)[]>("MGET", ...ids.map((id) => k("products", id)));
  raw.forEach((v) => { if (v) { const p = JSON.parse(v) as MenuProduct; map.set(p.id, p); } });
  return map;
}

/** Halaman Stok Barang: produk Dengan Stok + bahan baku (non-produk). Produk Tanpa Stok disembunyikan. */
export async function listInventory(): Promise<InventoryRow[]> {
  await ensureSeed();
  const ids = (await redis.cmd<string[]>("SMEMBERS", k("inventory:index"))).sort();
  if (!ids.length) return [];
  const [metas, stocks] = await Promise.all([
    redis.cmd<(string | null)[]>("MGET", ...ids.map((id) => k("inventory_meta", id))),
    redis.cmd<(string | null)[]>("MGET", ...ids.map((id) => k("inventory", id))),
  ]);
  const parsed = metas.map((raw) => (raw ? (JSON.parse(raw) as InventoryMeta) : null));
  const products = await getProducts(parsed.flatMap((m) => (m ? [m.productId ?? m.id] : [])));
  const rows: InventoryRow[] = [];
  parsed.forEach((meta, i) => {
    if (!meta) return;
    const p = products.get(meta.productId ?? meta.id);
    if (p && !p.trackStock) return; // produk diatur Tanpa Stok: saldo & riwayat tetap tersimpan, tidak ditampilkan
    const stock = Number(stocks[i] ?? 0); // habis tetap tampil
    rows.push({ ...meta, stock, status: statusOf(stock, meta.minStock) });
  });
  return rows;
}

/** Inventori untuk produk Dengan Stok: dibuat sekali (stok awal 0), tidak pernah mereset saldo. */
export async function ensureProductInventory(p: MenuProduct): Promise<void> {
  const cat = await redis.get<{ name: string }>(k("categories", p.categoryId));
  const existing = await redis.get<InventoryMeta>(k("inventory_meta", p.id));
  const meta: InventoryMeta = {
    id: p.id, productId: p.id, name: p.name, category: cat?.name ?? "", unit: p.unit ?? "pcs",
    minStock: existing?.minStock ?? 0,
  };
  await redis.set(k("inventory_meta", p.id), meta); // nama/kategori/satuan ikut produk; minimum dipertahankan
  await redis.cmd("SET", k("inventory", p.id), "0", "NX");
  await redis.cmd("SADD", k("inventory:index"), p.id);
}

/** Barang bahan baku (bukan produk): dibuat bila belum ada. Tidak boleh menyentuh produk Tanpa Stok/Nasi. */
export async function ensureInventoryItem(name: string, unit: string, category = "Bahan Baku"): Promise<string> {
  const id = slugify(name);
  if (!id) throw new Error("Nama barang tidak valid");
  if (id === "nasi") throw new Error("Nasi tidak dilacak sebagai stok");
  const product = await redis.get<MenuProduct>(k("products", id));
  if (product && !product.trackStock) throw new Error(`${product.name} diatur Tanpa Stok, tidak bisa menerima stok`);
  const meta: InventoryMeta = { id, name: name.trim(), category, unit: unit.trim() || "pcs", minStock: 0 };
  await redis.cmd("SET", k("inventory_meta", id), JSON.stringify(meta), "NX");
  await redis.cmd("SET", k("inventory", id), "0", "NX");
  await redis.cmd("SADD", k("inventory:index"), id);
  return id;
}

type LuaOut =
  | { status: "ok"; recordId: string; number: string }
  | { status: "duplicate"; recordId: string }
  | { status: "conflict" }
  | { status: "missing"; itemId: string }
  | { status: "insufficient"; itemId: string; have: number; need: number };

export type ApplyOutcome =
  | { ok: true; record: unknown; duplicate: boolean }
  | { ok: false; error: string; status: number };

export const CONFLICT_MESSAGE =
  "Permintaan ini memakai kunci yang sama dengan permintaan yang berbeda. Muat ulang halaman lalu coba lagi.";

async function nameOf(id: string): Promise<string> {
  return (await redis.get<InventoryMeta>(k("inventory_meta", id)))?.name ?? id;
}

/**
 * Satu-satunya jalur mutasi stok + penyimpanan catatan (penjualan, pembelian, penyesuaian, pengeluaran).
 * all-or-nothing & idempotent karena dijalankan sebagai satu script Lua atomik.
 */
export async function applyStock(p: {
  idemKey: string; seqName: string; recordName: string; numberPrefix: string; record: object;
  type: MovementType; note: string; deltas: Record<string, number>; actorId: string; payload: unknown;
}): Promise<ApplyOutcome> {
  // Produk Tanpa Stok tidak boleh menerima mutasi inventori.
  const ids = Object.keys(p.deltas);
  const products = await getProducts(ids);
  for (const id of ids) {
    const prod = products.get(id);
    if (prod && !prod.trackStock)
      return { ok: false, status: 409, error: `${prod.name} diatur Tanpa Stok, jadi tidak bisa menerima atau mengurangi stok.` };
  }

  const { keys, args } = buildApplyCall({ ...p, k, recordName: p.recordName, payloadHash: payloadHash(p.payload) });
  const r = JSON.parse(await redis.eval<string>(APPLY_STOCK_LUA, keys, args)) as LuaOut;

  switch (r.status) {
    case "conflict": return { ok: false, status: 409, error: CONFLICT_MESSAGE };
    case "missing": return { ok: false, status: 409, error: `Barang ${await nameOf(r.itemId)} belum memiliki catatan stok` };
    case "insufficient":
      return { ok: false, status: 409, error: `Stok ${await nameOf(r.itemId)} tidak cukup (tersisa ${r.have}, dibutuhkan ${r.need})` };
    default:
      return { ok: true, record: await redis.get(r.recordId), duplicate: r.status === "duplicate" };
  }
}

export async function listMovements(offset = 0, limit = 100, itemId?: string): Promise<StockMovement[]> {
  const index = itemId ? k("stock_movements:item", itemId) : k("stock_movements:index");
  const ids = await redis.cmd<string[]>("ZREVRANGE", index, offset, offset + limit - 1);
  if (!ids.length) return [];
  const raw = await redis.cmd<(string | null)[]>("MGET", ...ids);
  const moves = raw.filter((v): v is string => v != null).map((v) => JSON.parse(v) as StockMovement);
  const names = new Map<string, string>();
  for (const id of new Set(moves.map((m) => m.itemId))) names.set(id, await nameOf(id));
  return moves.map((m) => ({ ...m, itemName: names.get(m.itemId) }));
}
