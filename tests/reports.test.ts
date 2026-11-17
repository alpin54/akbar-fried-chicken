import test from "node:test";
import assert from "node:assert/strict";
import { buildReport, groupDaily, dateKey, type SaleLite } from "../src/lib/domain/reports.ts";

const ts = (iso: string) => new Date(iso).getTime();
const sale = (iso: string, total: number, status = "selesai", items: SaleLite["items"] = []): SaleLite =>
  ({ createdAt: ts(iso), status, total, items });

test("dateKey memakai zona waktu Jakarta (UTC+7)", () => {
  assert.equal(dateKey(ts("2026-11-15T18:30:00Z")), "2026-11-16"); // 01:30 WIB
});
test("Ringkasan: pembatalan tidak dihitung, selisih benar", () => {
  const r = buildReport({
    from: "2026-11-15", to: "2026-11-16",
    sales: [
      sale("2026-11-15T05:00:00Z", 30000, "selesai", [{ productName: "Ayam + Nasi", quantity: 2, subtotal: 30000, variant: "dada" }]),
      sale("2026-11-15T06:00:00Z", 99999, "dibatalkan"),
      sale("2026-11-16T05:00:00Z", 10000, "selesai", [{ productName: "Nasi", quantity: 2, subtotal: 10000, variant: null }]),
      sale("2026-10-01T05:00:00Z", 777, "selesai"), // di luar periode
    ],
    purchases: [{ date: "2026-11-15", kind: "ayam", supplier: "Pak Budi", total: 600000 },
                { date: "2026-11-16", kind: "lainnya", supplier: "", total: 50000 }],
    expenses: [{ date: "2026-11-16", category: "Listrik", total: 100000 }],
  });
  assert.equal(r.summary.salesTotal, 40000);
  assert.equal(r.summary.transactions, 2);
  assert.equal(r.summary.cancelled, 1);
  assert.equal(r.summary.purchasesTotal, 650000);
  assert.equal(r.summary.net, 40000 - 650000 - 100000);
  assert.deepEqual(r.variants, [{ variant: "dada", quantity: 2 }]);
  assert.equal(r.products[0].name, "Ayam + Nasi");
  assert.equal(r.daily.length, 2);
  assert.equal(r.expenseByCategory[0].category, "Listrik");
  assert.equal(r.purchasesBySupplier.find((s) => s.supplier === "Tanpa supplier")?.total, 50000);
});
test("Pengelompokan mingguan & bulanan", () => {
  const r = buildReport({ from: "2026-11-01", to: "2026-12-05", sales: [], expenses: [], purchases: [] });
  const m = groupDaily(r.daily, "month");
  assert.deepEqual(m.map((x) => x.date), ["2026-11", "2026-12"]);
  const w = groupDaily(r.daily, "week");
  assert.equal(w[0].date, "2026-10-26"); // 1 Nov 2026 hari Minggu -> minggu mulai Senin 26 Okt
});
