// Aturan pembelian (BAGIAN 9 & 10). Tanpa import relatif agar mudah diuji.
export type ConversionRecipe = { dada: number; sayap: number; paha_atas: number; paha_bawah: number };
export const DEFAULT_CONVERSION: ConversionRecipe = { dada: 4, sayap: 2, paha_atas: 2, paha_bawah: 2 };
const PARTS = ["dada", "paha_atas", "paha_bawah", "sayap"] as const;

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

/** Produk yang menerima stok dari pembelian ayam utuh (ID produk = ID inventori). */
export const PIECE_PRODUCTS = ["dada", "paha_atas", "paha_bawah", "sayap"] as const;
export type PieceProduct = (typeof PIECE_PRODUCTS)[number];

export type PiecesCalc =
  | { ok: true; pieces: Record<string, number>; totalPieces: number; perBird: number }
  | { ok: false; error: string };

/** Stok masuk = jumlah ekor x potongan per ekor. Dipakai bersama oleh preview di browser dan server. */
export function computePieces(birds: number, rule: ConversionRecipe): PiecesCalc {
  if (!Number.isInteger(birds) || birds < 1) return { ok: false, error: "Jumlah ekor minimal 1" };
  const bad = validateConversion(rule);
  if (bad) return { ok: false, error: bad };
  const pieces: Record<string, number> = {};
  let totalPieces = 0;
  let perBird = 0;
  for (const p of PIECE_PRODUCTS) {
    const q = birds * rule[p];
    if (!Number.isSafeInteger(q) || q > 1_000_000_000) return { ok: false, error: "Hasil perkalian terlalu besar" };
    if (q > 0) pieces[p] = q; // nilai 0 = tidak menghasilkan potongan itu, tidak ada mutasi stok
    totalPieces += q;
    perBird += rule[p];
  }
  return { ok: true, pieces, totalPieces, perBird };
}

export type ChickenPurchaseCalc =
  | { ok: true; total: number; pieces: Record<string, number>; totalPieces: number }
  | { ok: false; error: string };

/** Total = berat KG x harga/KG. Potongan ditentukan JUMLAH EKOR, bukan berat. */
export function computeChickenPurchase(
  input: { weightKg: number; birds: number; pricePerKg: number },
  recipe: ConversionRecipe,
): ChickenPurchaseCalc {
  const { weightKg, birds, pricePerKg } = input;
  if (!(typeof weightKg === "number" && weightKg > 0 && Number.isFinite(weightKg)))
    return { ok: false, error: "Berat harus lebih dari 0" };
  if (!Number.isInteger(birds) || birds < 1) return { ok: false, error: "Jumlah ekor minimal 1" };
  if (!Number.isInteger(pricePerKg) || pricePerKg < 1) return { ok: false, error: "Harga per KG tidak valid" };
  const conv = computePieces(birds, recipe);
  if (!conv.ok) return conv;
  const total = Math.round(weightKg * pricePerKg);
  if (!Number.isSafeInteger(total)) return { ok: false, error: "Total pembelian terlalu besar" };
  return { ok: true, total, pieces: conv.pieces, totalPieces: conv.totalPieces };
}

export type ChickenPurchaseInput = {
  date: string; supplier?: string; weightKg: number; birds: number; pricePerKg: number; note?: string;
  /** Aturan potongan per ekor khusus pembelian ini. Bila kosong, dipakai aturan default global. */
  cuttingRule?: ConversionRecipe;
};

/**
 * Menyusun catatan pembelian ayam + stok masuk. FUNGSI MURNI: tidak membaca/menulis aturan global.
 * Aturan yang dipakai disimpan sebagai snapshot di transaksi ini saja.
 */
export function buildChickenPurchase(
  input: ChickenPurchaseInput, globalRule: ConversionRecipe,
  ctx: { user: { id: string; name: string }; now: number },
):
  | { ok: true; record: Record<string, unknown>; deltas: Record<string, number> }
  | { ok: false; error: string } {
  const rule = input.cuttingRule ?? globalRule;
  const calc = computeChickenPurchase(input, rule);
  if (!calc.ok) return calc;
  const snapshotRule: ConversionRecipe = { dada: rule.dada, paha_atas: rule.paha_atas, paha_bawah: rule.paha_bawah, sayap: rule.sayap };
  const sameAsGlobal = PIECE_PRODUCTS.every((p) => rule[p] === globalRule[p]);
  return {
    ok: true,
    deltas: { ...calc.pieces },
    record: {
      id: "__ID__", number: "__NUMBER__", kind: "ayam", status: "selesai",
      date: input.date, supplier: input.supplier?.trim() ?? "", note: input.note?.trim() ?? "",
      weightKg: input.weightKg, birds: input.birds, pricePerKg: input.pricePerKg, total: calc.total,
      // Snapshot aturan pembelian ini (ID produk sebagai kunci)
      chickenCount: input.birds, cuttingRule: snapshotRule, convertedStock: { ...calc.pieces },
      totalPieces: calc.totalPieces, ruleSource: sameAsGlobal ? "default" : "custom",
      // Nama lama dipertahankan untuk kompatibilitas tampilan & reversal
      recipeSnapshot: snapshotRule, pieces: { ...calc.pieces }, stockIn: { ...calc.pieces },
      createdAt: ctx.now, createdBy: ctx.user.id, createdByName: ctx.user.name,
    },
  };
}

export type OtherPurchaseCalc =
  | { ok: true; total: number }
  | { ok: false; error: string };

export function computeOtherPurchase(input: { quantity: number; unitPrice: number }): OtherPurchaseCalc {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) return { ok: false, error: "Jumlah minimal 1 (bilangan bulat)" };
  if (!Number.isInteger(input.unitPrice) || input.unitPrice < 0) return { ok: false, error: "Harga tidak valid" };
  return { ok: true, total: input.quantity * input.unitPrice };
}
