import { k, redis } from "@/lib/redis";
import { slugify } from "@/lib/domain/purchases";
import { planStockChange, validateStockConfig } from "@/lib/domain/product-stock";
import type { MenuProduct } from "@/lib/domain/sales";
import { ensureSeed } from "./catalog";
import { ensureProductInventory } from "./stock";

// sortOrder tidak diubah lewat form: dipertahankan dari data yang ada.
export type ProductInput = Omit<MenuProduct, "id" | "sortOrder">;

export type ProductOutcome =
  | { ok: true; product: MenuProduct }
  | { ok: false; status: number; error: string; code?: "CONFIRM_DISABLE_STOCK"; balance?: number; movements?: number };

// Aturan bisnis: Nasi tidak pernah punya stok maupun komposisi bahan.
const guard = (id: string, i: ProductInput): ProductInput =>
  id === "nasi" || slugify(i.name) === "nasi" ? { ...i, trackStock: false, usesChicken: false, usesSambal: false } : i;

const categoryExists = async (id: string) => (await redis.cmd<number>("SISMEMBER", k("categories:index"), id)) === 1;

function configError(id: string, i: ProductInput): string | null {
  return validateStockConfig({ id, name: i.name, trackStock: i.trackStock, usesChicken: i.usesChicken, usesSambal: i.usesSambal });
}

export async function createProduct(raw: ProductInput): Promise<ProductOutcome> {
  await ensureSeed();
  const base = slugify(raw.name);
  if (!base) return { ok: false, status: 400, error: "Nama produk tidak valid" };
  const input = guard("", raw);
  const err = configError("", input);
  if (err) return { ok: false, status: 400, error: err };
  if (!(await categoryExists(input.categoryId))) return { ok: false, status: 400, error: "Kategori tidak ditemukan" };
  const id = `${base}_${Math.random().toString(36).slice(2, 6)}`;
  const product: MenuProduct = { id, ...input, name: input.name.trim() };
  await redis.set(k("products", id), product);
  await redis.cmd("SADD", k("products:index"), id);
  if (product.trackStock) await ensureProductInventory(product); // stok awal 0
  return { ok: true, product };
}

/** Harga & pengaturan stok baru hanya berlaku untuk transaksi baru: transaksi lama menyimpan snapshot. */
export async function updateProduct(id: string, raw: ProductInput, confirmDisableStock = false): Promise<ProductOutcome> {
  const before = await redis.get<MenuProduct>(k("products", id));
  if (!before) return { ok: false, status: 404, error: "Produk tidak ditemukan" };
  const input = guard(id, raw);
  const err = configError(id, input);
  if (err) return { ok: false, status: 400, error: err };
  if (!(await categoryExists(input.categoryId))) return { ok: false, status: 400, error: "Kategori tidak ditemukan" };

  let history = null;
  if (before.trackStock && !input.trackStock) {
    const [bal, movements] = await Promise.all([
      redis.cmd<string | null>("GET", k("inventory", id)),
      redis.cmd<number>("ZCARD", k("stock_movements:item", id)),
    ]);
    history = { balance: Number(bal ?? 0), movements };
  }
  const plan = planStockChange(before, input, history, confirmDisableStock);
  if (plan.action === "needs_confirmation") {
    return { ok: false, status: 409, code: "CONFIRM_DISABLE_STOCK", balance: plan.balance, movements: plan.movements,
      error: `${before.name} masih punya saldo ${plan.balance} dan ${plan.movements} riwayat stok. Jika diubah ke Tanpa Stok, saldo dan riwayat tetap tersimpan tetapi produk disembunyikan dari Stok Barang dan tidak dikurangi saat dijual.` };
  }
  const after: MenuProduct = { ...before, ...input, id, name: input.name.trim() };
  await redis.set(k("products", id), after);
  if (after.trackStock) await ensureProductInventory(after); // Tanpa Stok -> Dengan Stok: inventori awal 0 bila belum ada
  return { ok: true, product: after };
}
