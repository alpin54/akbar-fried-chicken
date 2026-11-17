import test from "node:test";
import assert from "node:assert/strict";
import { planStockChange, validateStockConfig } from "../src/lib/domain/product-stock.ts";

const cfg = (o: Partial<Parameters<typeof validateStockConfig>[0]> = {}) =>
  ({ id: "x", name: "X", trackStock: true, usesChicken: false, usesSambal: false, ...o });

test("Tanpa Stok -> Dengan Stok membuat inventori awal 0", () => {
  assert.deepEqual(planStockChange({ trackStock: false }, { trackStock: true }, null, false), { action: "create_inventory" });
  assert.deepEqual(planStockChange(null, { trackStock: true }, null, false), { action: "create_inventory" });
});
test("Dengan Stok -> Tanpa Stok: tanpa riwayat langsung boleh; ada saldo/riwayat wajib konfirmasi; saldo & riwayat tetap utuh", () => {
  assert.deepEqual(planStockChange({ trackStock: true }, { trackStock: false }, { balance: 0, movements: 0 }, false), { action: "disable_keep_history" });
  const need = planStockChange({ trackStock: true }, { trackStock: false }, { balance: 7, movements: 3 }, false);
  assert.deepEqual(need, { action: "needs_confirmation", balance: 7, movements: 3 });
  assert.deepEqual(planStockChange({ trackStock: true }, { trackStock: false }, { balance: 7, movements: 3 }, true), { action: "disable_keep_history" });
});
test("Produk Tanpa Stok tetap Tanpa Stok: tidak ada aksi inventori", () => {
  assert.deepEqual(planStockChange({ trackStock: false }, { trackStock: false }, null, false), { action: "none" });
});
test("Validasi server: Nasi tidak boleh punya stok; paket tidak punya stok sendiri; produk biasa boleh", () => {
  assert.ok(validateStockConfig(cfg({ id: "nasi", name: "Nasi" })));
  assert.ok(validateStockConfig(cfg({ id: "p", name: "Paket", usesChicken: true })));
  assert.ok(validateStockConfig(cfg({ id: "p", name: "Paket", usesSambal: true })));
  assert.equal(validateStockConfig(cfg({ id: "ceker", name: "Ceker" })), null);
  assert.equal(validateStockConfig(cfg({ id: "nasi", name: "Nasi", trackStock: false })), null);
  assert.equal(validateStockConfig(cfg({ id: "p", name: "Paket", usesChicken: true, trackStock: false })), null);
});
