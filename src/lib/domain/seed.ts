// Data awal & seeder idempotent. Tanpa import relatif agar bisa diuji dengan Redis tiruan.
// Aturan: hanya MEMBUAT yang belum ada (SET NX). Tidak pernah menimpa data yang sudah diedit admin.
export type Cmd = <T = unknown>(...args: (string | number)[]) => Promise<T>;
export type KeyFn = (...parts: (string | number)[]) => string;

export const SEED_VERSION = "seed-v3";

export const CATEGORY_SEED = [
  { id: "paket", name: "Paket", sortOrder: 1 },
  { id: "tambahan", name: "Tambahan", sortOrder: 2 },
  { id: "fried_chicken", name: "Fried Chicken", sortOrder: 3 },
] as const;

export const UNIT_SEED = ["porsi", "pcs", "potong", "kg", "liter"] as const;

type SeedProduct = {
  id: string; name: string; categoryId: string; price: number; unit: string; sortOrder: number;
  usesChicken: boolean; usesSambal: boolean;
  trackStock: boolean; // Dengan Stok => punya inventori dengan ID yang sama dengan ID produk
  minStock: number;
};
const P = (
  sortOrder: number, id: string, name: string, categoryId: string, price: number, unit: string,
  o: Partial<Pick<SeedProduct, "usesChicken" | "usesSambal" | "trackStock" | "minStock">> = {},
): SeedProduct => ({ id, name, categoryId, price, unit, sortOrder, usesChicken: false, usesSambal: false, trackStock: false, minStock: 0, ...o });

// Harga: integer Rupiah.
// Paket & Nasi: Tanpa Stok (paket mengurangi bahan baku lewat komposisi). Produk Fried Chicken & Sambal: Dengan Stok.
export const PRODUCT_SEED: SeedProduct[] = [
  P(1, "ayam_nasi", "Ayam + Nasi", "paket", 15000, "porsi", { usesChicken: true }),
  P(2, "ayam_geprek", "Ayam Geprek", "paket", 12000, "porsi", { usesChicken: true, usesSambal: true }),
  P(3, "geprek_nasi", "Ayam Geprek + Nasi", "paket", 18000, "porsi", { usesChicken: true, usesSambal: true }),
  P(4, "nasi", "Nasi", "tambahan", 4000, "porsi"), // Nasi: tanpa stok, selamanya
  P(5, "sambal", "Sambal", "tambahan", 3000, "porsi", { trackStock: true, minStock: 10 }),
  P(6, "dada", "Dada", "fried_chicken", 9000, "potong", { trackStock: true, minStock: 5 }),
  P(7, "paha_atas", "Paha Atas", "fried_chicken", 9000, "potong", { trackStock: true, minStock: 5 }),
  P(8, "paha_bawah", "Paha Bawah", "fried_chicken", 8000, "potong", { trackStock: true, minStock: 5 }),
  P(9, "sayap", "Sayap", "fried_chicken", 9000, "potong", { trackStock: true, minStock: 5 }),
  // Ati Ampela, Kepala, Ceker: punya stok, TIDAK ikut konversi pembelian ayam (masuk lewat Pembelian Barang Lain / penyesuaian).
  P(10, "ati_ampela", "Ati Ampela", "fried_chicken", 4000, "pcs", { trackStock: true, minStock: 5 }),
  P(11, "kepala", "Kepala", "fried_chicken", 3000, "pcs", { trackStock: true, minStock: 5 }),
  P(12, "ceker", "Ceker", "fried_chicken", 2000, "pcs", { trackStock: true, minStock: 5 }),
];

export const DEFAULT_CONVERSION = { dada: 4, paha_atas: 2, paha_bawah: 2, sayap: 2 }; // hanya 4 potongan ini
export const DEFAULT_SALE_RECIPE = { sambalPerPortion: 1 };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const parse = (v: unknown) => (typeof v === "string" ? (JSON.parse(v) as Record<string, unknown>) : null);

export type SeedReport = { categories: number; units: number; products: number; inventory: number; migrated: number };

export async function seedMasterData(cmd: Cmd, k: KeyFn): Promise<SeedReport> {
  const report: SeedReport = { categories: 0, units: 0, products: 0, inventory: 0, migrated: 0 };
  const created = (r: unknown) => r === "OK";

  for (const c of CATEGORY_SEED) {
    if (created(await cmd("SET", k("categories", c.id), JSON.stringify(c), "NX"))) report.categories++;
    await cmd("SADD", k("categories:index"), c.id);
  }
  for (const u of UNIT_SEED) {
    if (created(await cmd("SET", k("units", u), JSON.stringify({ id: u, name: u }), "NX"))) report.units++;
    await cmd("SADD", k("units:index"), u);
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
    const { minStock: _min, ...fields } = p;
    let tracked = p.trackStock;

    if (created(await cmd("SET", key, JSON.stringify({ ...fields, active: true }), "NX"))) {
      if (taken.has(`${p.categoryId}|${norm(p.name)}`)) {
        await cmd("DEL", key); // nama sama sudah dipakai produk lain di kategori ini
        continue;
      }
      report.products++;
    } else {
      // Sudah ada: jangan timpa harga/konfigurasi. Hanya migrasi data lama yang belum punya trackStock.
      const cur = parse(await cmd("GET", key));
      if (cur && cur.trackStock === undefined) {
        const { stockItemId, ...rest } = cur as Record<string, unknown>;
        tracked = stockItemId !== undefined || p.trackStock;
        await cmd("SET", key, JSON.stringify({ ...rest, trackStock: tracked }));
        report.migrated++;
      } else if (cur) {
        tracked = cur.trackStock === true;
      }
    }
    await cmd("SADD", k("products:index"), p.id); // pastikan index terbentuk walau record sudah ada

    // Inventori hanya untuk produk Dengan Stok. NX: tidak pernah mereset saldo atau menggandakan.
    if (tracked) {
      const category = CATEGORY_SEED.find((c) => c.id === p.categoryId)?.name ?? "";
      const meta = { id: p.id, productId: p.id, name: p.name, category, unit: p.unit, minStock: p.minStock };
      if (created(await cmd("SET", k("inventory_meta", p.id), JSON.stringify(meta), "NX"))) report.inventory++;
      await cmd("SET", k("inventory", p.id), "0", "NX"); // angka mentah dipakai Lua
      await cmd("SADD", k("inventory:index"), p.id);
    }
  }

  await cmd("SET", k("settings", "conversion_recipe"), JSON.stringify(DEFAULT_CONVERSION), "NX");
  await cmd("SET", k("settings", "sale_recipe"), JSON.stringify(DEFAULT_SALE_RECIPE), "NX");
  return report;
}
