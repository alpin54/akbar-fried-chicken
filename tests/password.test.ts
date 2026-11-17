import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/lib/auth/password.ts";

test("hash tidak plaintext, password benar diterima, salah ditolak", async () => {
  const h = await hashPassword("rahasia123");
  assert.ok(!h.includes("rahasia123"));
  assert.equal(await verifyPassword("rahasia123", h), true);
  assert.equal(await verifyPassword("salah", h), false);
  assert.equal(await verifyPassword("x", "bukan-hash"), false);
});
test("hash berbeda tiap kali (salt acak)", async () => {
  assert.notEqual(await hashPassword("a"), await hashPassword("a"));
});
