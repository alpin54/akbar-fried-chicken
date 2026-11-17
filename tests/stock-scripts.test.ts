import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { APPLY_STOCK_LUA, REVERSE_STOCK_LUA, buildApplyCall, buildReverseCall } from "../src/lib/domain/stock-script.ts";
import { payloadHash } from "../src/lib/domain/idempotency.ts";

// Menjalankan script Lua ASLI terhadap Redis tiruan (liblua5.4 via Python). Dilewati bila liblua tidak ada.
type Step = { script: string; keys: string[]; args: (string | number)[] };
type LuaOut = { value?: Record<string, unknown>; error?: string };
type Run = { results: LuaOut[]; kv: Record<string, string>; zsets: Record<string, string[]> };

function runLua(kv: Record<string, string>, steps: Step[]): Run | null {
  const r = spawnSync("python3", ["tests/lua/harness.py"], { input: JSON.stringify({ kv, steps }), encoding: "utf8" });
  if (r.status === 77 || r.error) {
    // REQUIRE_LUA=1 (npm run test:strict): jangan diam-diam melewati tes atomicity.
    if (process.env.REQUIRE_LUA) assert.fail("liblua tidak ditemukan. Pasang Lua 5.4 (brew install lua) atau set LUA_LIB=/path/liblua5.4.dylib");
    return null;
  }
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout) as Run & { errors: string[] };
  assert.deepEqual(out.errors, []);
  for (const x of out.results) assert.equal(x.error, undefined, x.error);
  return out;
}

const k = (...p: (string | number)[]) => "t:" + p.join(":");
let t0 = 1_700_000_000_000;
const sale = (idem: string, deltas: Record<string, number>, payload: unknown = deltas): Step => ({
  script: APPLY_STOCK_LUA,
  ...buildApplyCall({
    k, idemKey: idem, seqName: "sale", recordName: "sales", numberPrefix: "TRX",
    record: { id: "__ID__", number: "__NUMBER__", status: "selesai" }, type: "penjualan", note: "Penjualan",
    payloadHash: payloadHash(payload), actorId: "u1", deltas, now: t0++,
  }),
});
const purchase = (idem: string, deltas: Record<string, number>): Step => ({
  script: APPLY_STOCK_LUA,
  ...buildApplyCall({
    k, idemKey: idem, seqName: "purchase", recordName: "purchases", numberPrefix: "PB",
    record: { id: "__ID__", number: "__NUMBER__", kind: "ayam" }, type: "pembelian", note: "Pembelian ayam",
    payloadHash: payloadHash(deltas), actorId: "u1", deltas, now: t0++,
  }),
});
const reverse = (idem: string, cancelKey: string, number: string, deltas: Record<string, number>, type: string, reason = "salah input"): Step => ({
  script: REVERSE_STOCK_LUA,
  ...buildReverseCall({
    k, idemKey: idem, cancelKey, transactionNumber: number, transactionId: "tx", reason,
    payloadHash: payloadHash({ cancelKey, reason }), actorId: "u1", type, cancel: { at: 1, reason }, deltas, now: t0++,
  }),
});
const inv = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([id, v]) => [k("inventory", id), String(v)]));
const stock = (r: Run, id: string) => Number(r.kv[k("inventory", id)]);
const v = (r: Run, i: number) => r.results[i].value as Record<string, unknown>;

test("Race condition: stok Dada 5, kasir A jual 4 lalu kasir B jual 3 -> hanya satu berhasil, tidak negatif", (t) => {
  const r = runLua(inv({ dada: 5 }), [sale("idem-A-0001", { dada: -4 }), sale("idem-B-0001", { dada: -3 })]);
  if (!r) return t.skip("liblua5.4 tidak tersedia");
  assert.equal(v(r, 0).status, "ok");
  assert.equal(v(r, 1).status, "insufficient");
  assert.equal(stock(r, "dada"), 1);
  assert.equal(r.zsets[k("sales:index")].length, 1); // hanya satu transaksi tersimpan
});

test("Tidak ada partial update: satu bahan kurang -> stok lain, transaksi, movement, idempotency tidak berubah", (t) => {
  const r = runLua(inv({ dada: 5, sambal: 1 }), [sale("idem-partial-1", { dada: -2, sambal: -3 })]);
  if (!r) return t.skip("liblua5.4 tidak tersedia");
  assert.equal(v(r, 0).status, "insufficient");
  assert.equal(v(r, 0).itemId, "sambal");
  assert.equal(stock(r, "dada"), 5); assert.equal(stock(r, "sambal"), 1);
  assert.equal(r.zsets[k("sales:index")], undefined);
  assert.equal(r.zsets[k("stock_movements:index")], undefined);
  assert.equal(r.kv[k("idempotency", "sales", "idem-partial-1")], undefined);
  assert.equal(r.kv[k("sequences", "sale")], undefined); // nomor transaksi tidak terpakai
});

test("Idempotency: double submit dengan key & payload sama -> satu transaksi, stok berkurang sekali", (t) => {
  const r = runLua(inv({ dada: 10 }), [sale("idem-same-001", { dada: -2 }), sale("idem-same-001", { dada: -2 })]);
  if (!r) return t.skip("liblua5.4 tidak tersedia");
  assert.equal(v(r, 0).status, "ok");
  assert.equal(v(r, 1).status, "duplicate");
  assert.equal(v(r, 1).recordId, v(r, 0).recordId);
  assert.equal(stock(r, "dada"), 8);
  assert.equal(r.zsets[k("sales:index")].length, 1);
});

test("Idempotency: key sama dengan payload berbeda ditolak (conflict) tanpa mengubah stok", (t) => {
  const r = runLua(inv({ dada: 10 }), [sale("idem-conf-001", { dada: -2 }), sale("idem-conf-001", { dada: -5 })]);
  if (!r) return t.skip("liblua5.4 tidak tersedia");
  assert.equal(v(r, 1).status, "conflict");
  assert.equal(stock(r, "dada"), 8);
  assert.equal(r.zsets[k("sales:index")].length, 1);
});

test("Penjualan langsung Ati Ampela 2, Kepala 3, Ceker 5 dari stok 10/15/20 -> 8/12/15, tanpa menyentuh stok lain", (t) => {
  const r = runLua(inv({ ati_ampela: 10, kepala: 15, ceker: 20, dada: 5, sambal: 7 }),
    [sale("idem-direct-01", { ati_ampela: -2, kepala: -3, ceker: -5 })]);
  if (!r) return t.skip("liblua5.4 tidak tersedia");
  assert.deepEqual([stock(r, "ati_ampela"), stock(r, "kepala"), stock(r, "ceker")], [8, 12, 15]);
  assert.deepEqual([stock(r, "dada"), stock(r, "sambal")], [5, 7]);
});

test("Movement lengkap: ID, produk, transaksi, saldo sebelum/sesudah, aktor, waktu; indeks per barang", (t) => {
  const r = runLua(inv({ dada: 10 }), [sale("idem-move-001", { dada: -3 })]);
  if (!r) return t.skip("liblua5.4 tidak tersedia");
  const mid = k("stock_movements") + ":TRX000001:dada";
  const m = JSON.parse(r.kv[mid]);
  assert.equal(m.productId, "dada"); assert.equal(m.ref, "TRX000001");
  assert.equal(m.balanceBefore, 10); assert.equal(m.stockAfter, 7); assert.equal(m.qtyOut, 3);
  assert.equal(m.actorId, "u1"); assert.equal(m.type, "penjualan"); assert.ok(m.transactionId && m.ts);
  assert.deepEqual(r.zsets[k("stock_movements:item", "dada")], [mid]);
});

test("Barang tanpa catatan inventori ditolak (missing), tidak ada yang berubah", (t) => {
  const r = runLua(inv({ dada: 5 }), [sale("idem-miss-001", { dada: -1, nasi: -1 })]);
  if (!r) return t.skip("liblua5.4 tidak tersedia");
  assert.equal(v(r, 0).status, "missing"); assert.equal(v(r, 0).itemId, "nasi");
  assert.equal(stock(r, "dada"), 5);
  assert.equal(r.kv[k("inventory", "nasi")], undefined); // tidak ada inventori Nasi yang terbentuk
});

test("Pembelian 5 ekor default: Dada +20, Paha Atas +10, Paha Bawah +10, Sayap +10; Ati/Kepala/Ceker tetap", (t) => {
  const r = runLua(inv({ dada: 0, paha_atas: 0, paha_bawah: 0, sayap: 0, ati_ampela: 3, kepala: 4, ceker: 5 }),
    [purchase("idem-buy-0001", { dada: 20, paha_atas: 10, paha_bawah: 10, sayap: 10 })]);
  if (!r) return t.skip("liblua5.4 tidak tersedia");
  assert.deepEqual([stock(r, "dada"), stock(r, "paha_atas"), stock(r, "paha_bawah"), stock(r, "sayap")], [20, 10, 10, 10]);
  assert.deepEqual([stock(r, "ati_ampela"), stock(r, "kepala"), stock(r, "ceker")], [3, 4, 5]);
});

test("Pembelian barang lain: Ati Ampela +10, Kepala +15, Ceker +20", (t) => {
  const r = runLua(inv({ ati_ampela: 0, kepala: 0, ceker: 0 }), [
    purchase("idem-oth-0001", { ati_ampela: 10 }), purchase("idem-oth-0002", { kepala: 15 }), purchase("idem-oth-0003", { ceker: 20 }),
  ]);
  if (!r) return t.skip("liblua5.4 tidak tersedia");
  assert.deepEqual([stock(r, "ati_ampela"), stock(r, "kepala"), stock(r, "ceker")], [10, 15, 20]);
});

test("Pembatalan penjualan: stok kembali sekali; ulang dengan key baru = already; key sama = duplicate", (t) => {
  const r = runLua(inv({ dada: 10, sambal: 4 }), [
    sale("idem-cx-sale1", { dada: -3, sambal: -2 }),
    reverse("idem-cancel-01", k("sales_cancel", "1"), "TRX000001", { dada: 3, sambal: 2 }, "pembatalan_penjualan"),
    reverse("idem-cancel-02", k("sales_cancel", "1"), "TRX000001", { dada: 3, sambal: 2 }, "pembatalan_penjualan"),
    reverse("idem-cancel-01", k("sales_cancel", "1"), "TRX000001", { dada: 3, sambal: 2 }, "pembatalan_penjualan"),
  ]);
  if (!r) return t.skip("liblua5.4 tidak tersedia");
  assert.equal(v(r, 1).status, "ok"); assert.equal(v(r, 2).status, "already"); assert.equal(v(r, 3).status, "duplicate");
  assert.equal(stock(r, "dada"), 10); assert.equal(stock(r, "sambal"), 4); // tidak dikembalikan berkali-kali
  const rev = JSON.parse(r.kv[k("stock_movements") + ":REV-TRX000001:dada"]);
  assert.equal(rev.type, "pembatalan_penjualan"); assert.equal(rev.reversalOf, k("stock_movements") + ":TRX000001:dada");
  assert.equal(rev.qtyIn, 3); assert.equal(rev.balanceBefore, 7); assert.equal(rev.stockAfter, 10);
  assert.ok(r.kv[k("stock_movements") + ":TRX000001:dada"]); // movement asal tidak dihapus
});

test("Pembatalan pembelian tidak aman bila stok sudah terpakai: dibatalkan total, tidak ada perubahan", (t) => {
  const r = runLua(inv({ dada: 0 }), [
    purchase("idem-pb-00001", { dada: 20 }),
    sale("idem-use-00001", { dada: -15 }),
    reverse("idem-cancelpb1", k("purchases_cancel", "1"), "PB000001", { dada: -20 }, "pembatalan_pembelian"),
  ]);
  if (!r) return t.skip("liblua5.4 tidak tersedia");
  assert.equal(v(r, 2).status, "unsafe"); assert.equal(v(r, 2).have, 5); assert.equal(v(r, 2).need, 20);
  assert.equal(stock(r, "dada"), 5);
  assert.equal(r.kv[k("purchases_cancel", "1")], undefined); // tidak ditandai batal
});

test("Pembatalan pembelian aman bila stok masih cukup: stok berkurang tepat sekali", (t) => {
  const r = runLua(inv({ dada: 0 }), [
    purchase("idem-pb-00002", { dada: 20 }),
    reverse("idem-cancelpb2", k("purchases_cancel", "1"), "PB000001", { dada: -20 }, "pembatalan_pembelian"),
    reverse("idem-cancelpb3", k("purchases_cancel", "1"), "PB000001", { dada: -20 }, "pembatalan_pembelian"),
  ]);
  if (!r) return t.skip("liblua5.4 tidak tersedia");
  assert.equal(v(r, 1).status, "ok"); assert.equal(v(r, 2).status, "already");
  assert.equal(stock(r, "dada"), 0);
});

test("Transaksi tanpa bahan (Nasi saja / produk Tanpa Stok): tetap tersimpan, tanpa movement", (t) => {
  const r = runLua({}, [sale("idem-nasi-0001", {})]);
  if (!r) return t.skip("liblua5.4 tidak tersedia");
  assert.equal(v(r, 0).status, "ok");
  assert.equal(r.zsets[k("sales:index")].length, 1);
  assert.equal(r.zsets[k("stock_movements:index")], undefined);
});
