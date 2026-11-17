// Agregasi laporan & dashboard dari data transaksi asli. Fungsi murni (tanpa import relatif).
export type SaleLite = {
  createdAt: number; status: string; total: number;
  items: { productName: string; quantity: number; subtotal: number; variant: string | null }[];
};
export type PurchaseLite = { date: string; kind: string; supplier: string; total: number };
export type ExpenseLite = { date: string; category: string; total: number };

export type DayRow = { date: string; sales: number; transactions: number; purchases: number; expenses: number };
export type Report = {
  from: string; to: string;
  summary: {
    salesTotal: number; transactions: number; cancelled: number;
    purchasesTotal: number; purchasesChicken: number; purchasesOther: number;
    expensesTotal: number; net: number;
  };
  daily: DayRow[];
  products: { name: string; quantity: number; revenue: number }[];
  variants: { variant: string; quantity: number }[];
  expenseByCategory: { category: string; total: number }[];
  purchasesBySupplier: { supplier: string; total: number; count: number }[];
};

export const dateKey = (ts: number, tz = "Asia/Jakarta") =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: tz }).format(ts);

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function enumerateDates(from: string, to: string, max = 366): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < max; d = addDays(d, 1)) out.push(d);
  return out;
}

export function buildReport(i: {
  sales: SaleLite[]; purchases: PurchaseLite[]; expenses: ExpenseLite[];
  from: string; to: string; tz?: string;
}): Report {
  const daily = new Map<string, DayRow>(
    enumerateDates(i.from, i.to).map((d) => [d, { date: d, sales: 0, transactions: 0, purchases: 0, expenses: 0 }]),
  );
  const prod = new Map<string, { name: string; quantity: number; revenue: number }>();
  const vari = new Map<string, number>();
  const cat = new Map<string, number>();
  const sup = new Map<string, { supplier: string; total: number; count: number }>();
  const s = { salesTotal: 0, transactions: 0, cancelled: 0, purchasesTotal: 0, purchasesChicken: 0,
              purchasesOther: 0, expensesTotal: 0, net: 0 };

  for (const sale of i.sales) {
    const row = daily.get(dateKey(sale.createdAt, i.tz));
    if (!row) continue;
    if (sale.status === "dibatalkan") { s.cancelled++; continue; } // tidak dihitung sebagai penjualan
    row.sales += sale.total; row.transactions++;
    s.salesTotal += sale.total; s.transactions++;
    for (const it of sale.items) {
      const p = prod.get(it.productName) ?? { name: it.productName, quantity: 0, revenue: 0 };
      p.quantity += it.quantity; p.revenue += it.subtotal; prod.set(it.productName, p);
      if (it.variant) vari.set(it.variant, (vari.get(it.variant) ?? 0) + it.quantity);
    }
  }
  for (const p of i.purchases) {
    const row = daily.get(p.date);
    if (!row) continue;
    row.purchases += p.total; s.purchasesTotal += p.total;
    if (p.kind === "ayam") s.purchasesChicken += p.total; else s.purchasesOther += p.total;
    const key = p.supplier || "Tanpa supplier";
    const e = sup.get(key) ?? { supplier: key, total: 0, count: 0 };
    e.total += p.total; e.count++; sup.set(key, e);
  }
  for (const x of i.expenses) {
    const row = daily.get(x.date);
    if (!row) continue;
    row.expenses += x.total; s.expensesTotal += x.total;
    cat.set(x.category, (cat.get(x.category) ?? 0) + x.total);
  }
  s.net = s.salesTotal - s.purchasesTotal - s.expensesTotal;

  return {
    from: i.from, to: i.to, summary: s, daily: [...daily.values()],
    products: [...prod.values()].sort((a, b) => b.quantity - a.quantity),
    variants: [...vari].map(([variant, quantity]) => ({ variant, quantity })).sort((a, b) => b.quantity - a.quantity),
    expenseByCategory: [...cat].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total),
    purchasesBySupplier: [...sup.values()].sort((a, b) => b.total - a.total),
  };
}

export type Granularity = "day" | "week" | "month";

/** Kelompokkan baris harian menjadi harian / mingguan (mulai Senin) / bulanan. */
export function groupDaily(rows: DayRow[], g: Granularity): DayRow[] {
  if (g === "day") return rows;
  const out = new Map<string, DayRow>();
  for (const r of rows) {
    let key = r.date.slice(0, 7);
    if (g === "week") {
      const d = new Date(r.date + "T00:00:00Z");
      key = addDays(r.date, -((d.getUTCDay() + 6) % 7));
    }
    const e = out.get(key) ?? { date: key, sales: 0, transactions: 0, purchases: 0, expenses: 0 };
    e.sales += r.sales; e.transactions += r.transactions; e.purchases += r.purchases; e.expenses += r.expenses;
    out.set(key, e);
  }
  return [...out.values()];
}
