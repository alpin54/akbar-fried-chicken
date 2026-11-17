// Aturan penjualan & pengurangan stok (BAGIAN 6 & 8). Tanpa import relatif agar mudah diuji.
export const CHICKEN_PARTS = ["dada", "paha_atas", "paha_bawah", "sayap"] as const;
export type ChickenPart = (typeof CHICKEN_PARTS)[number];

export type MenuProduct = {
  id: string;
  name: string;
  price: number; // integer Rupiah
  active: boolean;
  usesChicken: boolean;
  usesSambal: boolean;
  categoryId: string; // relasi ke kategori memakai ID, bukan nama
  /** Dengan Stok: punya inventori (ID inventori = ID produk) dan dikurangi saat dijual satuan. */
  trackStock: boolean;
  code?: string;
  unit?: string;
  buyPrice?: number;
  sortOrder?: number;
};
export type SaleRecipe = { sambalPerPortion: number };
export type CartItemInput = { productId: string; quantity: number; variant?: ChickenPart };

export type SaleLine = {
  productId: string;
  productName: string; // snapshot
  unitPrice: number; // snapshot
  quantity: number;
  variant: ChickenPart | null;
  trackStock: boolean; // snapshot pengaturan stok saat transaksi
  subtotal: number;
  consumption: Record<string, number>; // inventoryId -> jumlah
};
export type SaleResult =
  | { ok: true; lines: SaleLine[]; total: number; received: number; change: number;
      consumption: Record<string, number>; recipeSnapshot: SaleRecipe }
  | { ok: false; error: string };

/** ID inventori potongan ayam = ID produknya. Nasi sengaja tidak punya inventori. */
export const chickenInventoryId = (p: ChickenPart) => p;
const NO_STOCK_IDS = ["nasi"];
export const SAMBAL_ID = "sambal";

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

export function computeSale(
  items: CartItemInput[],
  received: number,
  catalog: MenuProduct[],
  recipe: SaleRecipe,
): SaleResult {
  if (!items.length) return { ok: false, error: "Keranjang masih kosong" };
  const byId = new Map(catalog.map((p) => [p.id, p]));
  // Produk bahan (potongan/sambal) yang diatur Tanpa Stok tidak boleh dimutasi.
  const isTracked = (id: string) => (byId.get(id)?.trackStock ?? true);
  const lines: SaleLine[] = [];
  const total: Record<string, number> = {};
  let sum = 0;

  for (const it of items) {
    const p = byId.get(it.productId);
    if (!p || !p.active) return { ok: false, error: "Produk tidak ditemukan atau nonaktif" };
    if (!isInt(it.quantity) || it.quantity < 1) return { ok: false, error: `Jumlah ${p.name} tidak valid` };

    if (p.trackStock && (p.usesChicken || p.usesSambal))
      return { ok: false, error: `Pengaturan stok ${p.name} tidak valid` };
    let variant: ChickenPart | null = null;
    const consumption: Record<string, number> = {};
    if (p.usesChicken) {
      if (!it.variant || !CHICKEN_PARTS.includes(it.variant))
        return { ok: false, error: `Pilih bagian ayam untuk ${p.name}` };
      variant = it.variant;
      // Hanya varian terpilih; bila produk potongan itu diatur Tanpa Stok, tidak ada mutasi stok.
      if (isTracked(chickenInventoryId(variant))) consumption[chickenInventoryId(variant)] = it.quantity;
    } else if (it.variant) {
      return { ok: false, error: `${p.name} tidak memakai pilihan bagian ayam` };
    }
    if (p.trackStock) consumption[p.id] = (consumption[p.id] ?? 0) + it.quantity; // penjualan satuan
    if (p.usesSambal) {
      const s = it.quantity * recipe.sambalPerPortion;
      if (s > 0 && isTracked(SAMBAL_ID)) consumption[SAMBAL_ID] = s;
    }
    if (NO_STOCK_IDS.some((id) => id in consumption)) return { ok: false, error: "Nasi tidak memiliki stok" };
    for (const [id, q] of Object.entries(consumption)) total[id] = (total[id] ?? 0) + q;

    const subtotal = p.price * it.quantity; // harga dari katalog server, bukan client
    sum += subtotal;
    lines.push({ productId: p.id, productName: p.name, unitPrice: p.price,
      quantity: it.quantity, variant, trackStock: p.trackStock, subtotal, consumption });
  }

  if (!isInt(received) || received < sum)
    return { ok: false, error: "Uang diterima kurang dari total" };
  return { ok: true, lines, total: sum, received, change: received - sum,
    consumption: total, recipeSnapshot: { ...recipe } };
}
