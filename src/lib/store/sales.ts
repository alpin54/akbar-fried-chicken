import { k, redis } from "@/lib/redis";
import { SAVE_SALE_LUA } from "@/lib/domain/sale-script";
import { CANCEL_SALE_LUA } from "@/lib/domain/cancel-script";
import { computeSale, type CartItemInput } from "@/lib/domain/sales";
import { getCatalog, getInventoryName, getSaleRecipe } from "./catalog";

type LuaResult =
  | { status: "ok"; saleId: string; number: string }
  | { status: "duplicate"; saleId: string }
  | { status: "insufficient"; itemId: string; have: number; need: number };

export type CreateSaleOutcome =
  | { ok: true; sale: unknown; duplicate: boolean }
  | { ok: false; error: string; status: number };

export async function createSale(
  user: { id: string; name: string },
  input: { items: CartItemInput[]; received: number },
  idempotencyKey: string,
): Promise<CreateSaleOutcome> {
  const [catalog, recipe] = await Promise.all([getCatalog(), getSaleRecipe()]);
  const calc = computeSale(input.items, input.received, catalog, recipe);
  if (!calc.ok) return { ok: false, error: calc.error, status: 400 };

  const ts = Date.now();
  const salePrefix = k("sales") + ":";
  const sale = {
    id: "__ID__", number: "__NUMBER__", status: "selesai",
    createdAt: ts, cashierId: user.id, cashierName: user.name,
    items: calc.lines, total: calc.total, received: calc.received, change: calc.change,
    consumption: calc.consumption, recipeSnapshot: calc.recipeSnapshot,
  };
  const need = Object.entries(calc.consumption); // [itemId, qty]
  const keys = [
    k("idempotency", "sale", idempotencyKey), k("sequences", "sale"),
    k("sales:index"), k("stock_movements:index"),
    ...need.map(([id]) => k("inventory", id)),
  ];
  const args = [
    ts, salePrefix, JSON.stringify(sale), k("stock_movements") + ":",
    ...need.map(([, q]) => q), ...need.map(([id]) => id),
  ];

  const raw = await redis.eval<string>(SAVE_SALE_LUA, keys, args);
  const r = JSON.parse(raw) as LuaResult;

  if (r.status === "insufficient") {
    const name = await getInventoryName(r.itemId);
    return { ok: false, status: 409,
      error: `Stok ${name} tidak cukup (tersisa ${r.have}, dibutuhkan ${r.need})` };
  }
  const saved = await redis.get(r.saleId);
  return { ok: true, sale: saved, duplicate: r.status === "duplicate" };
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

export async function cancelSale(
  user: { id: string; name: string },
  saleId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const sale = await redis.get<{ number: string; consumption: Record<string, number> }>(k("sales", saleId));
  if (!sale) return { ok: false, error: "Transaksi tidak ditemukan", status: 404 };
  const cancel: Cancellation = { at: Date.now(), by: user.id, byName: user.name, reason };
  const need = Object.entries(sale.consumption ?? {});
  const keys = [k("sales_cancel", saleId), k("stock_movements:index"), ...need.map(([id]) => k("inventory", id))];
  const args = [
    cancel.at, k("stock_movements") + ":", JSON.stringify(cancel), sale.number, reason,
    ...need.map(([, q]) => q), ...need.map(([id]) => id),
  ];
  const r = JSON.parse(await redis.eval<string>(CANCEL_SALE_LUA, keys, args)) as { status: string };
  if (r.status === "already") return { ok: false, error: "Transaksi ini sudah dibatalkan", status: 409 };
  const logId = `${cancel.at}`;
  await redis.set(k("activity_logs", logId), { id: logId, ts: cancel.at, userId: user.id, action: "batal_penjualan", ref: sale.number, reason });
  await redis.cmd("ZADD", k("activity_logs:index"), cancel.at, k("activity_logs", logId));
  return { ok: true };
}
