import test from "node:test";
import assert from "node:assert/strict";
import { seedMasterData, PRODUCT_SEED, type Cmd } from "../src/lib/domain/seed.ts";

// Redis tiruan di memori: hanya perintah yang dipakai seeder.
function fakeRedis() {
  const kv = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const cmd = (async (...a: (string | number)[]) => {
    const [op, key] = [String(a[0]).toUpperCase(), String(a[1])];
    switch (op) {
      case "SET": {
        if (a.includes("NX") && kv.has(key)) return null;
        kv.set(key, String(a[2])); return "OK";
      }
      case "GET": return kv.get(key) ?? null;
      case "DEL": kv.delete(key); return 1;
      case "SADD": { const s = sets.get(key) ?? new Set(); s.add(String(a[2])); sets.set(key, s); return 1; }
      case "SMEMBERS": return [...(sets.get(key) ?? [])];
      case "MGET": return a.slice(1).map((x) => kv.get(String(x)) ?? null);
      default: throw new Error("perintah tidak didukung: " + op);
    }
  }) as Cmd;
  return { kv, sets, cmd };
}
const k = (...p: (string | number)[]) => "friedchicken:v1:" + p.join(":");
const products = (r: ReturnType<typeof fakeRedis>) =>
  [...(r.sets.get(k("products:index")) ?? [])].map((id) => JSON.parse(r.kv.get(k("products", id))!));

test("A. Redis kosong: 3 kategori, 12 produk, index terbentuk", async () => {
  const r = fakeRedis();
  const rep = await seedMasterData(r.cmd, k);
  assert.equal(rep.categories, 3); assert.equal(rep.products, 12);
  assert.equal(products(r).length, 12);
  assert.deepEqual([...r.sets.get(k("categories:index"))!].sort(), ["fried_chicken", "paket", "tambahan"]);
  const byName = Object.fromEntries(products(r).map((p) => [p.name, p]));
  assert.equal(byName["Ayam + Nasi"].price, 15000);
  assert.equal(byName["Ceker"].price, 2000);
  assert.equal(byName["Nasi"].price, 4000);
  assert.equal(byName["Paha Bawah"].categoryId, "fried_chicken");
  assert.ok(products(r).every((p) => Number.isInteger(p.price) && p.categoryId));
});
test("A. Inventori: 7 produk Fried Chicken + sambal stok awal 0; Nasi & paket tidak punya", async () => {
  const r = fakeRedis(); await seedMasterData(r.cmd, k);
  assert.deepEqual([...r.sets.get(k("inventory:index"))!].sort(), ["ati_ampela", "ceker", "dada", "kepala", "paha_atas", "paha_bawah", "sambal", "sayap"]);
  for (const id of ["nasi", "ayam_nasi", "ayam_geprek", "geprek_nasi"]) assert.equal(r.kv.has(k("inventory", id)), false);
  for (const id of ["dada", "paha_atas", "paha_bawah", "sayap", "ati_ampela", "kepala", "ceker"]) {
    assert.equal(r.kv.get(k("inventory", id)), "0");
    assert.equal(JSON.parse(r.kv.get(k("products", id))!).trackStock, true); // inventori memakai product ID
  }
  assert.equal(JSON.parse(r.kv.get(k("inventory_meta", "ceker"))!).unit, "pcs");
  assert.deepEqual(JSON.parse(r.kv.get(k("settings", "conversion_recipe"))!), { dada: 4, paha_atas: 2, paha_bawah: 2, sayap: 2 });
});
test("Seeder idempotent & tidak menimpa harga/stok yang sudah diedit", async () => {
  const r = fakeRedis(); await seedMasterData(r.cmd, k);
  const before = r.kv.size;
  const dada = JSON.parse(r.kv.get(k("products", "dada"))!);
  r.kv.set(k("products", "dada"), JSON.stringify({ ...dada, price: 12345, active: false }));
  r.kv.set(k("inventory", "dada"), "20");
  const rep = await seedMasterData(r.cmd, k);
  assert.deepEqual(rep, { categories: 0, units: 0, products: 0, inventory: 0, migrated: 0 });
  assert.equal(r.kv.size, before);
  assert.equal(products(r).length, 12);
  const after = JSON.parse(r.kv.get(k("products", "dada"))!);
  assert.equal(after.price, 12345); assert.equal(after.active, false);
  assert.equal(r.kv.get(k("inventory", "dada")), "20");
});
test("Tidak membuat produk duplikat bila nama sudah ada di kategori yang sama", async () => {
  const r = fakeRedis();
  r.kv.set(k("products", "manual_dada"), JSON.stringify({ id: "manual_dada", name: "dada", categoryId: "fried_chicken", price: 1 }));
  r.sets.set(k("products:index"), new Set(["manual_dada"]));
  const rep = await seedMasterData(r.cmd, k);
  assert.equal(rep.products, 11);
  assert.equal(r.kv.has(k("products", "dada")), false);
});
test("Daftar seed berisi tepat 12 produk dengan ID unik", () => {
  assert.equal(PRODUCT_SEED.length, 12);
  assert.equal(new Set(PRODUCT_SEED.map((p) => p.id)).size, 12);
});

import { DEFAULT_CONVERSION as SEED_CONV } from "../src/lib/domain/seed.ts";
import { DEFAULT_CONVERSION as PURCHASE_CONV } from "../src/lib/domain/purchases.ts";
test("Default konversi konsisten: 4/2/2/2 = 10 potong", () => {
  assert.deepEqual(SEED_CONV, PURCHASE_CONV);
  assert.equal(Object.values(SEED_CONV).reduce((a, b) => a + b, 0), 10);
});

test("Paket & Nasi: Tanpa Stok, tidak punya inventori; semua produk stok ber-trackStock", async () => {
  const r = fakeRedis(); await seedMasterData(r.cmd, k);
  const byId = Object.fromEntries(products(r).map((p) => [p.id, p]));
  for (const id of ["ayam_nasi", "ayam_geprek", "geprek_nasi", "nasi"]) assert.equal(byId[id].trackStock, false);
  for (const id of ["dada", "paha_atas", "paha_bawah", "sayap", "ati_ampela", "kepala", "ceker", "sambal"]) assert.equal(byId[id].trackStock, true);
  assert.equal(byId.ati_ampela.unit, "pcs");
});
test("Konversi default hanya 4 potongan (Ati/Kepala/Ceker tidak ikut)", async () => {
  const r = fakeRedis(); await seedMasterData(r.cmd, k);
  const conv = JSON.parse(r.kv.get(k("settings", "conversion_recipe"))!);
  assert.deepEqual(Object.keys(conv).sort(), ["dada", "paha_atas", "paha_bawah", "sayap"]);
});
test("Migrasi data v2 (tanpa trackStock): Ati/Kepala/Ceker dapat stok, harga & saldo berjalan tidak tersentuh", async () => {
  const r = fakeRedis(); await seedMasterData(r.cmd, k);
  // simulasi database v2: tanpa trackStock; potongan ayam & sambal memakai stockItemId; Ati/Kepala/Ceker belum punya stok
  for (const p of products(r)) {
    const { trackStock: _t, ...legacy } = p as Record<string, unknown>;
    if (["dada", "paha_atas", "paha_bawah", "sayap", "sambal"].includes(String(p.id))) (legacy as Record<string, unknown>).stockItemId = p.id;
    if (["ati_ampela", "kepala", "ceker"].includes(String(p.id))) legacy.price = 7777; // diedit admin
    r.kv.set(k("products", String(p.id)), JSON.stringify(legacy));
  }
  for (const id of ["ati_ampela", "kepala", "ceker"]) {
    r.kv.delete(k("inventory", id)); r.kv.delete(k("inventory_meta", id)); r.sets.get(k("inventory:index"))!.delete(id);
  }
  r.kv.set(k("inventory", "dada"), "42");
  const rep = await seedMasterData(r.cmd, k);
  assert.equal(rep.migrated, 12); assert.equal(rep.inventory, 3); assert.equal(rep.products, 0);
  const byId = Object.fromEntries(products(r).map((p) => [p.id, p]));
  for (const id of ["ati_ampela", "kepala", "ceker"]) {
    assert.equal(byId[id].trackStock, true); assert.equal(byId[id].price, 7777);
    assert.equal(r.kv.get(k("inventory", id)), "0");
  }
  assert.equal(byId.nasi.trackStock, false); assert.equal(byId.ayam_nasi.trackStock, false);
  assert.equal(byId.dada.stockItemId, undefined);
  assert.equal(r.kv.get(k("inventory", "dada")), "42");
  assert.equal((await seedMasterData(r.cmd, k)).migrated, 0);
});
test("Admin menonaktifkan stok produk: seeder tidak membuat ulang inventori & tidak mengubah pilihan admin", async () => {
  const r = fakeRedis(); await seedMasterData(r.cmd, k);
  const p = JSON.parse(r.kv.get(k("products", "kepala"))!); p.trackStock = false;
  r.kv.set(k("products", "kepala"), JSON.stringify(p));
  r.kv.delete(k("inventory", "kepala")); r.kv.delete(k("inventory_meta", "kepala")); r.sets.get(k("inventory:index"))!.delete("kepala");
  await seedMasterData(r.cmd, k);
  assert.equal(r.kv.has(k("inventory", "kepala")), false);
  assert.equal(JSON.parse(r.kv.get(k("products", "kepala"))!).trackStock, false);
});
