import { k, redis } from "@/lib/redis";
import { slugify } from "@/lib/domain/purchases";
import { ensureSeed } from "./catalog";

export type MasterType = "categories" | "units";
export type MasterItem = { id: string; name: string; sortOrder?: number };
export const isMasterType = (t: string): t is MasterType => t === "categories" || t === "units";

export async function listMaster(type: MasterType): Promise<MasterItem[]> {
  await ensureSeed();
  const ids = await redis.cmd<string[]>("SMEMBERS", k(`${type}:index`));
  if (!ids.length) return [];
  const raw = await redis.cmd<(string | null)[]>("MGET", ...ids.map((id) => k(type, id)));
  return raw
    .filter((v): v is string => v != null)
    .map((v) => JSON.parse(v) as MasterItem)
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.name.localeCompare(b.name));
}

export async function createMaster(type: MasterType, name: string): Promise<MasterItem | string> {
  await ensureSeed();
  const clean = name.trim();
  const id = slugify(clean);
  if (!id) return "Nama tidak valid";
  const item: MasterItem = { id, name: clean };
  if (!(await redis.cmd("SET", k(type, id), JSON.stringify(item), "NX"))) return "Nama sudah ada";
  await redis.cmd("SADD", k(`${type}:index`), id);
  return item;
}

/** Hapus hanya bila tidak dipakai produk (kategori lewat categoryId, satuan lewat nama). */
export async function deleteMaster(type: MasterType, id: string): Promise<string | null> {
  const item = await redis.get<MasterItem>(k(type, id));
  if (!item) return "Data tidak ditemukan";
  const ids = await redis.cmd<string[]>("SMEMBERS", k("products:index"));
  const raw = ids.length ? await redis.cmd<(string | null)[]>("MGET", ...ids.map((p) => k("products", p))) : [];
  const used = raw.some((v) => {
    if (!v) return false;
    const p = JSON.parse(v) as Record<string, string>;
    return type === "categories" ? p.categoryId === id : p.unit === item.name;
  });
  if (used) return `${item.name} masih dipakai produk, tidak bisa dihapus`;
  await redis.cmd("DEL", k(type, id));
  await redis.cmd("SREM", k(`${type}:index`), id);
  return null;
}
