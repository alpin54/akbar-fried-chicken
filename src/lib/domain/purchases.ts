// Aturan pembelian (BAGIAN 9 & 10). Tanpa import relatif agar mudah diuji.
export type ConversionRecipe = { dada: number; sayap: number; paha_atas: number; paha_bawah: number };
export const DEFAULT_CONVERSION: ConversionRecipe = { dada: 4, sayap: 2, paha_atas: 2, paha_bawah: 2 };
const PARTS = ["dada", "sayap", "paha_atas", "paha_bawah"] as const;

export const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

export function validateConversion(r: ConversionRecipe): string | null {
  let total = 0;
  for (const p of PARTS) {
    if (!Number.isInteger(r[p]) || r[p] < 0 || r[p] > 100) return "Jumlah potongan harus bilangan bulat 0–100";
    total += r[p];
  }
  return total > 0 ? null : "Total potongan per ekor harus lebih dari 0";
}

export type ChickenPurchaseCalc =
  | { ok: true; total: number; pieces: Record<string, number>; totalPieces: number }
  | { ok: false; error: string };

/** Total = berat KG × harga/KG. Potongan ditentukan JUMLAH EKOR, bukan berat. */
export function computeChickenPurchase(
  input: { weightKg: number; birds: number; pricePerKg: number },
  recipe: ConversionRecipe,
): ChickenPurchaseCalc {
  const { weightKg, birds, pricePerKg } = input;
  if (!(typeof weightKg === "number" && weightKg > 0 && Number.isFinite(weightKg)))
    return { ok: false, error: "Berat harus lebih dari 0" };
  if (!Number.isInteger(birds) || birds < 1) return { ok: false, error: "Jumlah ekor minimal 1" };
  if (!Number.isInteger(pricePerKg) || pricePerKg < 1) return { ok: false, error: "Harga per KG tidak valid" };
  const bad = validateConversion(recipe);
  if (bad) return { ok: false, error: bad };
  const pieces: Record<string, number> = {};
  let totalPieces = 0;
  for (const p of PARTS) {
    const q = birds * recipe[p];
    if (q > 0) pieces[p] = q; // ID inventori = ID produk (dada, paha_atas, paha_bawah, sayap)
    totalPieces += q;
  }
  return { ok: true, total: Math.round(weightKg * pricePerKg), pieces, totalPieces };
}

export type OtherPurchaseCalc =
  | { ok: true; total: number }
  | { ok: false; error: string };

export function computeOtherPurchase(input: { quantity: number; unitPrice: number }): OtherPurchaseCalc {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) return { ok: false, error: "Jumlah minimal 1 (bilangan bulat)" };
  if (!Number.isInteger(input.unitPrice) || input.unitPrice < 0) return { ok: false, error: "Harga tidak valid" };
  return { ok: true, total: input.quantity * input.unitPrice };
}
