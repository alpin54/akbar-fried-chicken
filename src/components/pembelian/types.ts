export type PurchaseRecord = {
  id: string; number: string; kind: "ayam" | "lainnya"; status: string;
  date: string; supplier: string; note: string; total: number; createdAt: number;
  // ayam
  recipeSnapshot?: Record<string, number>;
  weightKg?: number; birds?: number; pricePerKg?: number; pieces?: Record<string, number>;
  // lainnya
  name?: string; unit?: string; quantity?: number; unitPrice?: number; tracked?: boolean;
};

export const summarize = (p: PurchaseRecord) =>
  p.kind === "ayam"
    ? `Ayam ${p.birds} ekor (${p.weightKg} KG)`
    : `${p.name} ${p.quantity} ${p.unit}${p.tracked ? "" : " (tidak masuk stok)"}`;
