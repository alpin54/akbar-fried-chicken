import { k, redis } from "@/lib/redis";
import { computeSale, type CartItemInput } from "@/lib/domain/sales";
import { getCatalog, getSaleRecipe } from "./catalog";
import { applyStock } from "./stock";

export async function createSale(
  user: { id: string; name: string },
  input: { items: CartItemInput[]; received: number },
  idemKey: string,
): Promise<{ ok: true; sale: unknown; duplicate: boolean } | { ok: false; error: string; status: number }> {
  const [catalog, recipe] = await Promise.all([getCatalog(), getSaleRecipe()]);
  const calc = computeSale(input.items, input.received, catalog, recipe);
  if (!calc.ok) return { ok: false, error: calc.error, status: 400 };

  const sale = {
    id: "__ID__", number: "__NUMBER__", status: "selesai",
    createdAt: Date.now(), cashierId: user.id, cashierName: user.name,
    items: calc.lines, total: calc.total, received: calc.received, change: calc.change,
    consumption: calc.consumption, recipeSnapshot: calc.recipeSnapshot,
  };
  const deltas = Object.fromEntries(Object.entries(calc.consumption).map(([id, q]) => [id, -q]));
  const out = await applyStock({
    idemKey, seqName: "sale", recordName: "sales", numberPrefix: "TRX", record: sale,
    type: "penjualan", note: "Penjualan", deltas, actorId: user.id, payload: input,
  });
  return out.ok ? { ok: true, sale: out.record, duplicate: out.duplicate } : out;
}

type Cancellation = { at: number; by: string; byName: string; reason: string };

export async function listSales(offset = 0, limit = 50) {
  const keys = await redis.cmd<string[]>("ZREVRANGE", k("sales:index"), offset, offset + limit - 1);
  if (!keys.length) return [];
  const [raw, cancels] = await Promise.all([
    redis.cmd<(string | null)[]>("MGET", ...keys),
    redis.cmd<(string | null)[]>("MGET", ...keys.map((key) => key.replace(k("sales") + ":", k("sales_cancel") + ":"))),
  ]);
  const out: Record<string, unknown>[] = [];
  raw.forEach((v, i) => {
    if (v == null) return;
    const sale = JSON.parse(v) as Record<string, unknown>;
    const c = cancels[i] ? (JSON.parse(cancels[i] as string) as Cancellation) : null;
    out.push(c ? { ...sale, status: "dibatalkan", cancellation: c } : sale);
  });
  return out;
}
