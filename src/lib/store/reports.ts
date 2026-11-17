import { k, redis } from "@/lib/redis";
import { buildReport, dateKey, enumerateDates, type Report } from "@/lib/domain/reports";
import { listInventory } from "./stock";

export const TZ = process.env.APP_TIMEZONE || "Asia/Jakarta";
const MAX = 5000;

async function mgetJson<T>(keys: string[]): Promise<(T | null)[]> {
  const out: (T | null)[] = [];
  for (let i = 0; i < keys.length; i += 400) {
    const raw = await redis.cmd<(string | null)[]>("MGET", ...keys.slice(i, i + 400));
    out.push(...raw.map((v) => (v == null ? null : (JSON.parse(v) as T))));
  }
  return out;
}

export type SaleRow = {
  id: string; number: string; status: string; createdAt: number; total: number;
  received: number; change: number;
  items: { productName: string; quantity: number; subtotal: number; variant: string | null }[];
};
export type PurchaseRow = {
  id: string; number: string; kind: string; date: string; supplier: string; total: number;
  birds?: number; weightKg?: number; name?: string; quantity?: number; unit?: string;
};
export type ExpenseRow = {
  id: string; number: string; date: string; category: string; name: string; total: number;
};

export async function loadAll() {
  const [saleKeys, purKeys, expKeys] = await Promise.all([
    redis.cmd<string[]>("ZREVRANGE", k("sales:index"), 0, MAX - 1),
    redis.cmd<string[]>("ZREVRANGE", k("purchases:index"), 0, MAX - 1),
    redis.cmd<string[]>("ZREVRANGE", k("expenses:index"), 0, MAX - 1),
  ]);
  const cancelKeys = saleKeys.map((key) => key.replace(k("sales") + ":", k("sales_cancel") + ":"));
  const [sales, cancels, purchases, expenses] = await Promise.all([
    mgetJson<SaleRow>(saleKeys), mgetJson<unknown>(cancelKeys),
    mgetJson<PurchaseRow>(purKeys), mgetJson<ExpenseRow>(expKeys),
  ]);
  return {
    sales: sales.flatMap((s, i) => (s ? [cancels[i] ? { ...s, status: "dibatalkan" } : s] : [])),
    purchases: purchases.filter((x): x is PurchaseRow => !!x),
    expenses: expenses.filter((x): x is ExpenseRow => !!x),
  };
}

export async function getReport(from: string, to: string) {
  const data = await loadAll();
  const report: Report = buildReport({ ...data, from, to, tz: TZ });
  const inRange = (d: string) => d >= from && d <= to;
  return {
    report,
    salesRows: data.sales.filter((s) => inRange(dateKey(s.createdAt, TZ))),
    purchaseRows: data.purchases.filter((p) => inRange(p.date)),
    expenseRows: data.expenses.filter((e) => inRange(e.date)),
  };
}

export async function getDashboard() {
  const today = dateKey(Date.now(), TZ);
  const dates = enumerateDates(
    dateKey(Date.now() - 29 * 86400_000, TZ), today, 40,
  );
  const [{ report, salesRows }, inventory] = await Promise.all([
    getReport(dates[0], today), listInventory(),
  ]);
  const todayRow = report.daily.find((d) => d.date === today);
  const low = inventory.filter((i) => i.status !== "Tersedia");
  return {
    today,
    cards: {
      sales: todayRow?.sales ?? 0, transactions: todayRow?.transactions ?? 0,
      purchases: todayRow?.purchases ?? 0, expenses: todayRow?.expenses ?? 0,
      net: (todayRow?.sales ?? 0) - (todayRow?.purchases ?? 0) - (todayRow?.expenses ?? 0),
      lowStock: low.length, lowStockNames: low.map((i) => `${i.name} (${i.status})`),
    },
    daily: report.daily,
    products: report.products.slice(0, 5),
    recentSales: salesRows.slice(0, 5),
  };
}
