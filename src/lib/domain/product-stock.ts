// Aturan "Dengan Stok / Tanpa Stok" pada produk (field trackStock). Fungsi murni.
export type StockConfig = {
  id: string; name: string; trackStock: boolean; usesChicken: boolean; usesSambal: boolean;
};
export type StockHistory = { balance: number; movements: number };

/** Validasi konfigurasi di server. Mengembalikan pesan error atau null. */
export function validateStockConfig(p: StockConfig): string | null {
  const isNasi = p.id === "nasi" || p.name.trim().toLowerCase() === "nasi";
  if (isNasi && p.trackStock) return "Nasi tidak memiliki stok";
  if (p.trackStock && (p.usesChicken || p.usesSambal))
    return "Produk paket (memakai ayam atau sambal) tidak punya stok sendiri. Pilih Tanpa Stok; bahan bakunya dikurangi otomatis.";
  return null;
}

export type StockChangePlan =
  | { action: "none" }
  | { action: "create_inventory" } // Tanpa Stok -> Dengan Stok (stok awal 0 bila belum ada)
  | { action: "needs_confirmation"; balance: number; movements: number }
  | { action: "disable_keep_history" }; // saldo & riwayat tetap utuh

export function planStockChange(
  before: { trackStock: boolean } | null, after: { trackStock: boolean },
  history: StockHistory | null, confirmed: boolean,
): StockChangePlan {
  if (!before) return after.trackStock ? { action: "create_inventory" } : { action: "none" };
  if (before.trackStock === after.trackStock) return after.trackStock ? { action: "create_inventory" } : { action: "none" };
  if (after.trackStock) return { action: "create_inventory" };
  const h = history ?? { balance: 0, movements: 0 };
  if ((h.balance !== 0 || h.movements > 0) && !confirmed)
    return { action: "needs_confirmation", balance: h.balance, movements: h.movements };
  return { action: "disable_keep_history" };
}
