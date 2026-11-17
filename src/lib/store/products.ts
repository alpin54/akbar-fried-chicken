import { k, redis } from "@/lib/redis";
import { slugify } from "@/lib/domain/purchases";
import type { MenuProduct } from "@/lib/domain/sales";
import { ensureSeed } from "./catalog";

// stockItemId & sortOrder tidak diubah lewat form: dipertahankan dari data yang ada.
export type ProductInput = Omit<MenuProduct, "id" | "stockItemId" | "sortOrder">;

// Aturan bisnis: Nasi tidak pernah memakai stok ayam/sambal.
const guard = (name: string, i: ProductInput): ProductInput =>
  slugify(name) === "nasi" ? { ...i, usesChicken: false, usesSambal: false } : i;

const categoryExists = async (id: string) => (await redis.cmd<number>("SISMEMBER", k("categories:index"), id)) === 1;

export async function createProduct(raw: ProductInput): Promise<MenuProduct | string> {
  await ensureSeed();
  const input = guard(raw.name, raw);
  const base = slugify(input.name);
  if (!base) return "Nama produk tidak valid";
  if (!(await categoryExists(input.categoryId))) return "Kategori tidak ditemukan";
  const id = `${base}_${Math.random().toString(36).slice(2, 6)}`;
  const product: MenuProduct = { id, ...input, name: input.name.trim() };
  await redis.set(k("products", id), product);
  await redis.cmd("SADD", k("products:index"), id);
  return product;
}

/** Harga/resep baru hanya berlaku untuk transaksi baru: transaksi lama menyimpan snapshot. */
export async function updateProduct(id: string, raw: ProductInput): Promise<MenuProduct | string | null> {
  const before = await redis.get<MenuProduct>(k("products", id));
  if (!before) return null;
  const input = id === "nasi" ? guard("nasi", raw) : guard(raw.name, raw);
  if (!(await categoryExists(input.categoryId))) return "Kategori tidak ditemukan";
  const after: MenuProduct = { ...before, ...input, id, name: input.name.trim() };
  await redis.set(k("products", id), after);
  return after;
}
