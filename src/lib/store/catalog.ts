import { k, redis } from "@/lib/redis";
import { SEED_VERSION, DEFAULT_SALE_RECIPE, seedMasterData } from "@/lib/domain/seed";
import type { MenuProduct, SaleRecipe } from "@/lib/domain/sales";

export type InventoryMeta = {
  id: string; name: string; category: string; unit: string; minStock: number; productId?: string;
};

/** Error inisialisasi dengan pesan yang bisa langsung ditampilkan ke pengguna. */
export class SeedError extends Error {}

const RECHECK_MS = 30_000;
let verifiedAt = 0;
let inflight: Promise<void> | null = null;

async function runSeed(): Promise<void> {
  try {
    const marker = await redis.cmd<string | null>("GET", k("meta", "seed_version"));
    if (marker !== SEED_VERSION) {
      const rep = await seedMasterData(redis.cmd, k);
      // Penanda ditulis SETELAH seluruh data awal berhasil dibuat.
      await redis.cmd("SET", k("meta", "seed_version"), SEED_VERSION);
      console.info("[seed] selesai", rep);
    }
    verifiedAt = Date.now();
  } catch (e) {
    verifiedAt = 0;
    const detail = e instanceof Error ? e.message : String(e);
    throw new SeedError(`Inisialisasi data awal gagal: ${detail}. Periksa koneksi Redis (UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN).`);
  }
}

/** Idempotent. Kegagalan TIDAK diingat sebagai sukses, jadi dicoba lagi pada permintaan berikutnya. */
export function ensureSeed(): Promise<void> {
  if (Date.now() - verifiedAt < RECHECK_MS) return Promise.resolve();
  inflight ??= runSeed().finally(() => { inflight = null; });
  return inflight;
}

async function mget<T>(keys: string[]): Promise<T[]> {
  if (!keys.length) return [];
  const raw = await redis.cmd<(string | null)[]>("MGET", ...keys);
  return raw.filter((v): v is string => v != null).map((v) => JSON.parse(v) as T);
}

export async function getCatalog(): Promise<MenuProduct[]> {
  await ensureSeed();
  const ids = await redis.cmd<string[]>("SMEMBERS", k("products:index"));
  const list = await mget<MenuProduct>(ids.map((id) => k("products", id)));
  return list.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.name.localeCompare(b.name));
}

export async function getSaleRecipe(): Promise<SaleRecipe> {
  return (await redis.get<SaleRecipe>(k("settings", "sale_recipe"))) ?? DEFAULT_SALE_RECIPE;
}

export async function getInventoryName(id: string): Promise<string> {
  return (await redis.get<InventoryMeta>(k("inventory_meta", id)))?.name ?? id;
}
