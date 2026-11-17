import test from "node:test";
import assert from "node:assert/strict";
import { computeSale, type MenuProduct } from "../src/lib/domain/sales.ts";

const P = (id: string, name: string, price: number, c: boolean, s: boolean, trackStock = false): MenuProduct =>
  ({ id, name, price, active: true, usesChicken: c, usesSambal: s, categoryId: "x", trackStock });
const catalog = [
  P("nasi", "Nasi", 4000, false, false),
  P("dada", "Dada", 9000, false, false, true),
  P("ati_ampela", "Ati Ampela", 4000, false, false, true),
  P("kepala", "Kepala", 3000, false, false, true),
  P("ceker", "Ceker", 2000, false, false, true),
  P("sambal", "Sambal", 3000, false, false, true),
  P("ayam_nasi", "Ayam + Nasi", 15000, true, false),
  P("geprek", "Ayam Geprek", 12000, true, true),
  P("geprek_nasi", "Ayam Geprek + Nasi", 18000, true, true),
];
const r = { sambalPerPortion: 1 };

test("A. Ayam + Nasi Dada x2: hanya dada, tanpa sambal", () => {
  const s = computeSale([{ productId: "ayam_nasi", quantity: 2, variant: "dada" }], 50000, catalog, r);
  assert.ok(s.ok);
  assert.deepEqual(s.consumption, { dada: 2 });
  assert.equal(s.total, 30000); assert.equal(s.change, 20000);
});
test("B. Geprek Sayap x3", () => {
  const s = computeSale([{ productId: "geprek", quantity: 3, variant: "sayap" }], 50000, catalog, r);
  assert.ok(s.ok);
  assert.deepEqual(s.consumption, { sayap: 3, sambal: 3 });
  assert.equal(s.total, 36000); assert.equal(s.change, 14000);
});
test("C. Geprek + Nasi Paha Atas x2", () => {
  const s = computeSale([{ productId: "geprek_nasi", quantity: 2, variant: "paha_atas" }], 50000, catalog, r);
  assert.ok(s.ok);
  assert.deepEqual(s.consumption, { paha_atas: 2, sambal: 2 });
  assert.equal(s.change, 14000);
});
test("D. Nasi x5: tidak ada pengurangan stok", () => {
  const s = computeSale([{ productId: "nasi", quantity: 5 }], 50000, catalog, r);
  assert.ok(s.ok);
  assert.deepEqual(s.consumption, {});
  assert.equal(s.total, 20000); assert.equal(s.change, 30000);
});
test("E. Gabungan", () => {
  const s = computeSale([
    { productId: "ayam_nasi", quantity: 2, variant: "dada" },
    { productId: "geprek", quantity: 1, variant: "sayap" },
    { productId: "geprek_nasi", quantity: 2, variant: "paha_atas" },
    { productId: "nasi", quantity: 3 },
  ], 200000, catalog, r);
  assert.ok(s.ok);
  assert.deepEqual(s.consumption, { dada: 2, sayap: 1, paha_atas: 2, sambal: 3 });
  assert.ok(!("nasi" in s.consumption));
});
test("Validasi: varian wajib, bayar kurang, pas, harga client diabaikan", () => {
  assert.equal(computeSale([{ productId: "geprek", quantity: 1 }], 99999, catalog, r).ok, false);
  assert.equal(computeSale([{ productId: "nasi", quantity: 1 }], 3999, catalog, r).ok, false);
  const exact = computeSale([{ productId: "nasi", quantity: 1 }], 4000, catalog, r);
  assert.ok(exact.ok); assert.equal(exact.change, 0);
  assert.equal(computeSale([{ productId: "nasi", quantity: 1, variant: "dada" }], 9999, catalog, r).ok, false);
  assert.equal(computeSale([{ productId: "nasi", quantity: 0 }], 9999, catalog, r).ok, false);
});


import { computeChickenPurchase, DEFAULT_CONVERSION, computeOtherPurchase, validateConversion } from "../src/lib/domain/purchases.ts";
test("Pembelian ayam: 20 KG, 5 ekor, Rp30.000/KG", () => {
  const c = computeChickenPurchase({ weightKg: 20, birds: 5, pricePerKg: 30000 }, DEFAULT_CONVERSION);
  assert.ok(c.ok);
  assert.equal(c.total, 600000);
  assert.deepEqual(c.pieces, { dada: 20, sayap: 10, paha_atas: 10, paha_bawah: 10 });
  assert.equal(c.totalPieces, 50);
});
test("Potongan ditentukan ekor, bukan berat", () => {
  const a = computeChickenPurchase({ weightKg: 5, birds: 5, pricePerKg: 1000 }, DEFAULT_CONVERSION);
  const b = computeChickenPurchase({ weightKg: 99, birds: 5, pricePerKg: 1000 }, DEFAULT_CONVERSION);
  assert.ok(a.ok && b.ok); assert.deepEqual(a.pieces, b.pieces);
});
test("Resep kustom & validasi", () => {
  const c = computeChickenPurchase({ weightKg: 1.5, birds: 2, pricePerKg: 33333 },
    { dada: 3, sayap: 3, paha_atas: 2, paha_bawah: 2 });
  assert.ok(c.ok); assert.equal(c.total, 50000); assert.equal(c.pieces.dada, 6);
  assert.notEqual(validateConversion({ dada: 0, sayap: 0, paha_atas: 0, paha_bawah: 0 }), null);
  assert.equal(computeChickenPurchase({ weightKg: 0, birds: 1, pricePerKg: 1 }, DEFAULT_CONVERSION).ok, false);
  assert.equal(computeOtherPurchase({ quantity: 3, unitPrice: 15000 }).ok, true);
  assert.equal(computeOtherPurchase({ quantity: 0, unitPrice: 1 }).ok, false);
});


test("Penjualan satuan: Dada, Sambal, Ati, Kepala, Ceker punya stok sendiri; Nasi tidak", () => {
  const d = computeSale([{ productId: "dada", quantity: 2 }], 20000, catalog, r);
  assert.ok(d.ok); assert.deepEqual(d.consumption, { dada: 2 });
  const sm = computeSale([{ productId: "sambal", quantity: 3 }], 9000, catalog, r);
  assert.ok(sm.ok); assert.deepEqual(sm.consumption, { sambal: 3 });
  const c = computeSale([{ productId: "ceker", quantity: 5 }], 10000, catalog, r);
  assert.ok(c.ok); assert.deepEqual(c.consumption, { ceker: 5 });
  assert.equal(computeSale([{ productId: "dada", quantity: 1, variant: "dada" }], 9000, catalog, r).ok, false);
});
test("Varian tidak menyentuh potongan lain (Paha Bawah & Sayap)", () => {
  const a = computeSale([{ productId: "ayam_nasi", quantity: 1, variant: "paha_bawah" }], 15000, catalog, r);
  const b = computeSale([{ productId: "ayam_nasi", quantity: 1, variant: "sayap" }], 15000, catalog, r);
  assert.ok(a.ok && b.ok);
  assert.deepEqual(a.consumption, { paha_bawah: 1 }); assert.deepEqual(b.consumption, { sayap: 1 });
});

test("C. Penjualan langsung Ati 2, Kepala 3, Ceker 5: hanya stok masing-masing", () => {
  const s = computeSale([
    { productId: "ati_ampela", quantity: 2 }, { productId: "kepala", quantity: 3 }, { productId: "ceker", quantity: 5 },
  ], 100000, catalog, r);
  assert.ok(s.ok);
  assert.deepEqual(s.consumption, { ati_ampela: 2, kepala: 3, ceker: 5 });
  assert.equal(s.total, 2 * 4000 + 3 * 3000 + 5 * 2000);
  for (const id of ["dada", "paha_atas", "paha_bawah", "sayap", "sambal", "nasi"]) assert.ok(!(id in s.consumption));
});
test("Paket tidak melibatkan Ati/Kepala/Ceker", () => {
  const s = computeSale([{ productId: "geprek_nasi", quantity: 2, variant: "dada" }], 50000, catalog, r);
  assert.ok(s.ok);
  for (const id of ["ati_ampela", "kepala", "ceker", "nasi"]) assert.ok(!(id in s.consumption));
});
test("D. Konversi ayam hanya 4 potongan; Ati/Kepala/Ceker tidak berubah", () => {
  const c = computeChickenPurchase({ weightKg: 10, birds: 5, pricePerKg: 30000 }, DEFAULT_CONVERSION);
  assert.ok(c.ok);
  assert.deepEqual(Object.keys(c.pieces).sort(), ["dada", "paha_atas", "paha_bawah", "sayap"]);
  for (const id of ["ati_ampela", "kepala", "ceker"]) assert.ok(!(id in c.pieces));
  assert.equal(Object.keys(DEFAULT_CONVERSION).length, 4);
});

test("Produk bahan yang diatur Tanpa Stok tidak dimutasi (varian & sambal), snapshot trackStock tersimpan", () => {
  const cat = catalog.map((p) => (p.id === "dada" || p.id === "sambal" ? { ...p, trackStock: false } : p));
  const a = computeSale([{ productId: "geprek", quantity: 2, variant: "dada" }], 30000, cat, r);
  assert.ok(a.ok); assert.deepEqual(a.consumption, {}); // Dada & Sambal Tanpa Stok
  const b = computeSale([{ productId: "dada", quantity: 2 }], 20000, cat, r);
  assert.ok(b.ok); assert.deepEqual(b.consumption, {}); assert.equal(b.lines[0].trackStock, false);
  const c = computeSale([{ productId: "ceker", quantity: 1 }], 2000, cat, r);
  assert.ok(c.ok); assert.equal(c.lines[0].trackStock, true);
});
test("Konfigurasi tidak valid (paket + Dengan Stok) ditolak", () => {
  const bad = catalog.map((p) => (p.id === "ayam_nasi" ? { ...p, trackStock: true } : p));
  assert.equal(computeSale([{ productId: "ayam_nasi", quantity: 1, variant: "dada" }], 15000, bad, r).ok, false);
});
