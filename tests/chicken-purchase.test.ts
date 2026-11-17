import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  buildChickenPurchase, computePieces, DEFAULT_CONVERSION, type ChickenPurchaseInput,
} from "../src/lib/domain/purchases.ts";
import { APPLY_STOCK_LUA, buildApplyCall } from "../src/lib/domain/stock-script.ts";
import { payloadHash } from "../src/lib/domain/idempotency.ts";

const user = { id: "u1", name: "Admin" };
const base: ChickenPurchaseInput = { date: "2026-11-17", supplier: "Pak Budi", weightKg: 20, birds: 5, pricePerKg: 30000 };
const build = (extra: Partial<ChickenPurchaseInput> = {}, global = DEFAULT_CONVERSION) => {
  const r = buildChickenPurchase({ ...base, ...extra }, global, { user, now: 1_700_000_000_000 });
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r as Extract<typeof r, { ok: true }>;
};

// ---- Test 1-3: perhitungan
test("Test 1 - aturan default 5 ekor: 20/10/10/10", () => {
  const r = build();
  assert.deepEqual(r.deltas, { dada: 20, paha_atas: 10, paha_bawah: 10, sayap: 10 });
  assert.equal(r.record.totalPieces, 50); assert.equal(r.record.ruleSource, "default");
});
test("Test 2 - aturan custom 2/2/2/3, 5 ekor: 10/10/10/15 (45 potong, 9 per ekor)", () => {
  const rule = { dada: 2, paha_atas: 2, paha_bawah: 2, sayap: 3 };
  const r = build({ cuttingRule: rule });
  assert.deepEqual(r.deltas, { dada: 10, paha_atas: 10, paha_bawah: 10, sayap: 15 });
  assert.equal(r.record.totalPieces, 45); assert.equal(r.record.chickenCount, 5);
  assert.deepEqual(r.record.cuttingRule, rule); assert.deepEqual(r.record.convertedStock, r.deltas);
  assert.equal(r.record.ruleSource, "custom");
  const p = computePieces(5, rule); assert.ok(p.ok); assert.equal(p.perBird, 9);
});
test("Test 3 - nilai nol: Dada 0 -> tidak ada mutasi Dada", () => {
  const r = build({ cuttingRule: { dada: 0, paha_atas: 2, paha_bawah: 2, sayap: 2 } });
  assert.deepEqual(r.deltas, { paha_atas: 10, paha_bawah: 10, sayap: 10 });
  assert.equal("dada" in r.deltas, false);
  assert.equal((r.record.convertedStock as Record<string, number>).dada, undefined);
});
test("Hanya 4 produk yang menerima stok (Ati/Kepala/Ceker/Nasi/Sambal tidak pernah ada)", () => {
  const ids = Object.keys(build({ cuttingRule: { dada: 1, paha_atas: 1, paha_bawah: 1, sayap: 1 } }).deltas);
  for (const id of ["ati_ampela", "kepala", "ceker", "nasi", "sambal"]) assert.ok(!ids.includes(id));
});

// ---- Validasi
test("Validasi: negatif, pecahan, semua nol, ekor 0, dan nilai di luar batas ditolak", () => {
  const bad = (rule: Record<string, number>, birds = 5) =>
    computePieces(birds, rule as unknown as typeof DEFAULT_CONVERSION).ok;
  assert.equal(bad({ dada: -1, paha_atas: 2, paha_bawah: 2, sayap: 2 }), false);
  assert.equal(bad({ dada: 1.5, paha_atas: 2, paha_bawah: 2, sayap: 2 }), false);
  assert.equal(bad({ dada: 0, paha_atas: 0, paha_bawah: 0, sayap: 0 }), false);
  assert.equal(bad({ dada: 4, paha_atas: 2, paha_bawah: 2, sayap: 2 }, 0), false);
  assert.equal(bad({ dada: 101, paha_atas: 2, paha_bawah: 2, sayap: 2 }), false);
  assert.equal(computePieces(Number.MAX_SAFE_INTEGER, { dada: 100, paha_atas: 0, paha_bawah: 0, sayap: 0 }).ok, false);
  assert.equal(bad({ dada: 0, paha_atas: 0, paha_bawah: 0, sayap: 1 }), true); // satu jenis cukup
});

// ---- Test 4: perubahan aturan tidak mengubah pembelian lama; aturan global tidak disentuh
test("Test 4 - pembelian pertama (default) dan kedua (custom): snapshot masing-masing tetap, aturan global tidak berubah", () => {
  const globalRule = Object.freeze({ ...DEFAULT_CONVERSION }); // dibekukan: builder tidak boleh mengubahnya
  const first = build({}, globalRule);
  const firstSnapshot = JSON.stringify(first.record);
  const second = build({ birds: 5, cuttingRule: { dada: 2, paha_atas: 2, paha_bawah: 2, sayap: 3 } }, globalRule);
  assert.equal(JSON.stringify(first.record), firstSnapshot);
  assert.deepEqual(first.deltas, { dada: 20, paha_atas: 10, paha_bawah: 10, sayap: 10 });
  assert.deepEqual(second.deltas, { dada: 10, paha_atas: 10, paha_bawah: 10, sayap: 15 });
  assert.deepEqual(globalRule, { dada: 4, paha_atas: 2, paha_bawah: 2, sayap: 2 });
  // aturan global berubah belakangan -> pembelian lama (snapshot) tetap
  const later = build({}, { dada: 1, paha_atas: 1, paha_bawah: 1, sayap: 1 });
  assert.deepEqual(later.deltas, { dada: 5, paha_atas: 5, paha_bawah: 5, sayap: 5 });
  assert.deepEqual(first.record.cuttingRule, DEFAULT_CONVERSION);
});
test("Tanpa cuttingRule di request: memakai aturan global dan menyimpannya sebagai snapshot", () => {
  const r = build({}, { dada: 3, paha_atas: 2, paha_bawah: 2, sayap: 1 });
  assert.deepEqual(r.record.cuttingRule, { dada: 3, paha_atas: 2, paha_bawah: 2, sayap: 1 });
  assert.deepEqual(r.deltas, { dada: 15, paha_atas: 10, paha_bawah: 10, sayap: 5 });
});

// ---- Test 5 & 6: atomicity & idempotency pada script Lua asli (liblua)
type Run = { results: { value?: Record<string, unknown>; error?: string }[]; kv: Record<string, string>; zsets: Record<string, string[]> };
function runLua(kv: Record<string, string>, steps: { script: string; keys: string[]; args: (string | number)[] }[]): Run | null {
  const r = spawnSync("python3", ["tests/lua/harness.py"], { input: JSON.stringify({ kv, steps }), encoding: "utf8" });
  if (r.status === 77 || r.error) {
    if (process.env.REQUIRE_LUA) assert.fail("liblua tidak ditemukan (lihat README, bagian Pengujian)");
    return null;
  }
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout) as Run & { errors: string[] };
  assert.deepEqual(out.errors, []);
  for (const x of out.results) assert.equal(x.error, undefined, x.error);
  return out;
}
const k = (...p: (string | number)[]) => "t:" + p.join(":");
const inv = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([id, v]) => [k("inventory", id), String(v)]));
const purchase = (idem: string, input: ChickenPurchaseInput, now: number) => {
  const built = buildChickenPurchase(input, DEFAULT_CONVERSION, { user, now });
  assert.ok(built.ok);
  return {
    script: APPLY_STOCK_LUA,
    ...buildApplyCall({
      k, idemKey: idem, seqName: "purchase", recordName: "purchases", numberPrefix: "PB", record: built.record,
      type: "pembelian", note: "Pembelian ayam", payloadHash: payloadHash(input), actorId: user.id, deltas: built.deltas, now,
    }),
  };
};
const ZERO = { dada: 0, paha_atas: 0, paha_bawah: 0, sayap: 0, ati_ampela: 7, kepala: 8, ceker: 9 };

test("Test 5 - double submit dengan key sama: stok bertambah sekali; payload beda ditolak", (t) => {
  const custom = { ...base, cuttingRule: { dada: 2, paha_atas: 2, paha_bawah: 2, sayap: 3 } };
  const r = runLua(inv(ZERO), [
    purchase("idem-chicken-1", custom, 1), purchase("idem-chicken-1", custom, 2),
    purchase("idem-chicken-1", { ...custom, birds: 6 }, 3),
  ]);
  if (!r) return t.skip("liblua tidak tersedia");
  assert.equal(r.results[0].value?.status, "ok");
  assert.equal(r.results[1].value?.status, "duplicate");
  assert.equal(r.results[2].value?.status, "conflict");
  const st = (id: string) => Number(r.kv[k("inventory", id)]);
  assert.deepEqual([st("dada"), st("paha_atas"), st("paha_bawah"), st("sayap")], [10, 10, 10, 15]);
  assert.deepEqual([st("ati_ampela"), st("kepala"), st("ceker")], [7, 8, 9]); // tidak ikut konversi
  assert.equal(r.zsets[k("purchases:index")].length, 1);
  const rec = JSON.parse(r.kv[k("purchases") + ":1"]);
  assert.equal(rec.totalPieces, 45); assert.deepEqual(rec.cuttingRule, custom.cuttingRule);
  // movement terhubung dengan transaksi pembelian
  const mv = JSON.parse(r.kv[k("stock_movements") + ":PB000001:sayap"]);
  assert.equal(mv.ref, "PB000001"); assert.equal(mv.qtyIn, 15); assert.equal(mv.type, "pembelian"); assert.equal(mv.balanceBefore, 0);
});

test("Test 4b - dua pembelian berturut-turut (default lalu custom): rekaman pertama utuh, stok = jumlah keduanya", (t) => {
  const r = runLua(inv(ZERO), [
    purchase("idem-first-001", base, 1),
    purchase("idem-second-01", { ...base, cuttingRule: { dada: 2, paha_atas: 2, paha_bawah: 2, sayap: 3 } }, 2),
  ]);
  if (!r) return t.skip("liblua tidak tersedia");
  const first = JSON.parse(r.kv[k("purchases") + ":1"]);
  assert.deepEqual(first.cuttingRule, { dada: 4, paha_atas: 2, paha_bawah: 2, sayap: 2 });
  assert.deepEqual(first.convertedStock, { dada: 20, paha_atas: 10, paha_bawah: 10, sayap: 10 });
  const st = (id: string) => Number(r.kv[k("inventory", id)]);
  assert.deepEqual([st("dada"), st("paha_atas"), st("paha_bawah"), st("sayap")], [30, 20, 20, 25]);
});

test("Test 6 - kegagalan salah satu stok (Sayap tanpa catatan inventori): tidak ada pembelian/stok/movement tersimpan", (t) => {
  const partial = inv({ dada: 0, paha_atas: 0, paha_bawah: 0 }); // sayap tidak ada
  const r = runLua(partial, [purchase("idem-fail-0001", base, 1)]);
  if (!r) return t.skip("liblua tidak tersedia");
  assert.equal(r.results[0].value?.status, "missing"); assert.equal(r.results[0].value?.itemId, "sayap");
  assert.deepEqual([r.kv[k("inventory", "dada")], r.kv[k("inventory", "paha_atas")], r.kv[k("inventory", "paha_bawah")]], ["0", "0", "0"]);
  assert.equal(r.zsets[k("purchases:index")], undefined);
  assert.equal(r.zsets[k("stock_movements:index")], undefined);
  assert.equal(r.kv[k("sequences", "purchase")], undefined);
  assert.equal(r.kv[k("idempotency", "purchases", "idem-fail-0001")], undefined); // boleh dicoba lagi
});
