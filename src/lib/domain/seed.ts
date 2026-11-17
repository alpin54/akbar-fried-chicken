// Data awal & seeder idempotent. Tanpa import relatif agar bisa diuji dengan Redis tiruan.
// Aturan: hanya MEMBUAT yang belum ada (SET NX). Tidak pernah menimpa data yang sudah diedit admin.
export type Cmd = <T = unknown>(...args: (string | number)[]) => Promise<T>;
export type KeyFn = (...parts: (string | number)[]) => string;

export const SEED_VERSION = "seed-v2";

export const CATEGORY_SEED = [
  { id: "paket", name: "Paket", sortOrder: 1 },
  { id: "tambahan", name: "Tambahan", sortOrder: 2 },
  { id: "fried_chicken", name: "Fried Chicken", sortOrder: 3 },
] as const;

export const UNIT_SEED = ["porsi", "pcs", "potong", "kg", "liter"] as const;

type SeedProduct = {
  id: string; name: string; categoryId: string; price: number; unit: string; sortOrder: number;
  usesChicken: boolean; usesSambal: boolean; stockItemId?: string;
};
const P = (
  sortOrder: number, id: string, name: string, categoryId: string, price: number, unit: string,
  o: Partial<Pick<SeedProduct, "usesChicken" | "usesSambal" | "stockItemId">> = {},
): SeedProduct => ({ id, name, categoryId, price, unit, sortOrder, usesChicken: false, usesSambal: false, ...o });

// Harga: integer Rupiah. stockItemId = produk ini punya stok sendiri (ID inventori = ID produk).
export const PRODUCT_SEED: SeedProduct[] = [
  P(1, "ayam_nasi", "Ayam + Nasi", "paket", 15000, "porsi", { usesChicken: true }),
  P(2, "ayam_geprek", "Ayam Geprek", "paket", 12000, "porsi", { usesChicken: true, usesSambal: true }),
  P(3, "geprek_nasi", "Ayam Geprek + Nasi", "paket", 18000, "porsi", { usesChicken: true, usesSambal: true }),
  P(4, "nasi", "Nasi", "tambahan", 4000, "porsi"), // Nasi: tanpa stok, selamanya
  P(5, "sambal", "Sambal", "tambahan", 3000, "porsi", { stockItemId: "sambal" }),
  P(6, "dada", "Dada", "fried_chicken", 9000, "potong", { stockItemId: "dada" }),
  P(7, "paha_atas", "Paha Atas", "fried_chicken", 9000, "potong", { stockItemId: "paha_atas" }),
  P(8, "paha_bawah", "Paha Bawah", "fried_chicken", 8000, "potong", { stockItemId: "paha_bawah" }),
  P(9, "sayap", "Sayap", "fried_chicken", 9000, "potong", { stockItemId: "sayap" }),
  P(10, "ati_ampela", "Ati Ampela", "fried_chicken", 4000, "porsi"), // belum ada aturan konversi/stok
  P(11, "kepala", "Kepala", "fried_chicken", 3000, "porsi"),
  P(12, "ceker", "Ceker", "fried_chicken", 2000, "porsi"),
];

// Hanya 4 potongan hasil konversi ayam + sambal yang punya stok. Jumlah awal 0 (bukan data dummy).
export const INVENTORY_SEED = [
  { id: "dada", category: "Fried Chicken", unit: "potong", minStock: 5 },
  { id: "paha_atas", category: "Fried Chicken", unit: "potong", minStock: 5 },
  { id: "paha_bawah", category: "Fried Chicken", unit: "potong", minStock: 5 },
  { id: "sayap", category: "Fried Chicken", unit: "potong", minStock: 5 },
  { id: "sambal", category: "Tambahan", unit: "porsi", minStock: 10 },
] as const;

export const DEFAULT_CONVERSION = { dada: 4, paha_atas: 2, paha_bawah: 2, sayap: 2 };
export const DEFAULT_SALE_RECIPE = { sambalPerPortion: 1 };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const parse = (v: unknown) => (typeof v === "string" ? (JSON.parse(v) as Record<string, unknown>) : null);

export type SeedReport = { categories: number; units: number; products: number; inventory: number };

export async function seedMasterData(cmd: Cmd, k: KeyFn): Promise<SeedReport> {
  const report: SeedReport = { categories: 0, units: 0, products: 0, inventory: 0 };
  const created = (r: unknown) => r === "OK";

  for (const c of CATEGORY_SEED) {
    if (created(await cmd("SET", k("categories", c.id), JSON.stringify(c), "NX"))) report.categories++;
    await cmd("SADD", k("categories:index"), c.id);
  }
  for (const u of UNIT_SEED) {
    const id = u;
    if (created(await cmd("SET", k("units", id), JSON.stringify({ id, name: u }), "NX"))) report.units++;
    await cmd("SADD", k("units:index"), id);
  }

  // Produk yang sudah ada (mis. dibuat/diganti nama admin): jangan buat duplikat nama dalam kategori sama.
  const ids = await cmd<string[]>("SMEMBERS", k("products:index"));
  const existing = ids.length ? await cmd<(string | null)[]>("MGET", ...ids.map((id) => k("products", id))) : [];
  const taken = new Set<string>();
  existing.forEach((v) => {
    const p = parse(v);
    if (p) taken.add(`${p.categoryId}|${norm(String(p.name))}`);
  });

  for (const p of PRODUCT_SEED) {
    const key = k("products", p.id);
    const record = { ...p, active: true };
    if (created(await cmd("SET", key, JSON.stringify(record), "NX"))) {
      if (taken.has(`${p.categoryId}|${norm(p.name)}`)) {
        await cmd("DEL", key); // nama sama sudah dipakai produk lain di kategori ini
        continue;
      }
      report.products++;
    }
    await cmd("SADD", k("products:index"), p.id); // pastikan index terbentuk walau record sudah ada
  }

  for (const i of INVENTORY_SEED) {
    const product = PRODUCT_SEED.find((p) => p.id === i.id);
    const meta = { id: i.id, productId: i.id, name: product?.name ?? i.id, category: i.category, unit: i.unit, minStock: i.minStock };
    if (created(await cmd("SET", k("inventory_meta", i.id), JSON.stringify(meta), "NX"))) report.inventory++;
    await cmd("SET", k("inventory", i.id), "0", "NX"); // angka mentah; tidak menimpa stok yang ada
    await cmd("SADD", k("inventory:index"), i.id);
  }

  await cmd("SET", k("settings", "conversion_recipe"), JSON.stringify(DEFAULT_CONVERSION), "NX");
  await cmd("SET", k("settings", "sale_recipe"), JSON.stringify(DEFAULT_SALE_RECIPE), "NX");
  return report;
}
