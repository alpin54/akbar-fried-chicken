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
test("Inventori hanya 4 potongan + sambal; Nasi & paket tidak punya stok", async () => {
  const r = fakeRedis(); await seedMasterData(r.cmd, k);
  assert.deepEqual([...r.sets.get(k("inventory:index"))!].sort(), ["dada", "paha_atas", "paha_bawah", "sambal", "sayap"]);
  for (const id of ["nasi", "ayam_nasi", "ati_ampela", "kepala", "ceker"]) assert.equal(r.kv.has(k("inventory", id)), false);
  assert.equal(r.kv.get(k("inventory", "dada")), "0");
  assert.deepEqual(JSON.parse(r.kv.get(k("settings", "conversion_recipe"))!), { dada: 4, paha_atas: 2, paha_bawah: 2, sayap: 2 });
});
test("Seeder idempotent & tidak menimpa harga/stok yang sudah diedit", async () => {
  const r = fakeRedis(); await seedMasterData(r.cmd, k);
  const before = r.kv.size;
  const dada = JSON.parse(r.kv.get(k("products", "dada"))!);
  r.kv.set(k("products", "dada"), JSON.stringify({ ...dada, price: 12345, active: false }));
  r.kv.set(k("inventory", "dada"), "20");
  const rep = await seedMasterData(r.cmd, k);
  assert.deepEqual(rep, { categories: 0, units: 0, products: 0, inventory: 0 });
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
