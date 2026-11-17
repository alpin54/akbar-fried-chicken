import { k, redis } from "@/lib/redis";
import { REVERSE_STOCK_LUA, buildReverseCall } from "@/lib/domain/stock-script";
import { payloadHash } from "@/lib/domain/idempotency";
import { CONFLICT_MESSAGE } from "./stock";
import type { InventoryMeta } from "./catalog";

type Kind = "sale" | "purchase";
type LuaOut =
  | { status: "ok" } | { status: "duplicate" } | { status: "already" } | { status: "conflict" }
  | { status: "unsafe"; itemId: string; have: number; need: number };

/** Pembatalan penjualan/pembelian dengan reversal stok. Atomik, idempotent, hanya sekali, histori asli utuh. */
export async function reverseTransaction(p: {
  kind: Kind; id: string; user: { id: string; name: string }; reason: string; idemKey: string;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const recordKey = k(p.kind === "sale" ? "sales" : "purchases", p.id);
  const rec = await redis.get<{
    number: string; consumption?: Record<string, number>; stockIn?: Record<string, number>; pieces?: Record<string, number>;
  }>(recordKey);
  if (!rec) return { ok: false, status: 404, error: "Transaksi tidak ditemukan" };

  // Penjualan: kembalikan (+) apa yang dikurangi. Pembelian: tarik (-) apa yang ditambahkan.
  const deltas: Record<string, number> = {};
  if (p.kind === "sale") for (const [id, q] of Object.entries(rec.consumption ?? {})) deltas[id] = q;
  else for (const [id, q] of Object.entries(rec.stockIn ?? rec.pieces ?? {})) deltas[id] = -q;

  const cancel = { at: Date.now(), by: p.user.id, byName: p.user.name, reason: p.reason };
  const { keys, args } = buildReverseCall({
    k, idemKey: p.idemKey, cancelKey: k(p.kind === "sale" ? "sales_cancel" : "purchases_cancel", p.id),
    transactionNumber: rec.number, transactionId: recordKey, reason: p.reason,
    payloadHash: payloadHash({ kind: p.kind, id: p.id, reason: p.reason }), actorId: p.user.id,
    type: p.kind === "sale" ? "pembatalan_penjualan" : "pembatalan_pembelian", cancel, deltas,
  });
  const r = JSON.parse(await redis.eval<string>(REVERSE_STOCK_LUA, keys, args)) as LuaOut;

  if (r.status === "conflict") return { ok: false, status: 409, error: CONFLICT_MESSAGE };
  if (r.status === "already") return { ok: false, status: 409, error: "Transaksi ini sudah dibatalkan" };
  if (r.status === "unsafe") {
    const name = (await redis.get<InventoryMeta>(k("inventory_meta", r.itemId)))?.name ?? r.itemId;
    return { ok: false, status: 409, error: r.need === 0
      ? `Pembatalan tidak aman: catatan stok ${name} tidak ditemukan.`
      : `Pembatalan tidak aman: stok ${name} tinggal ${r.have}, padahal harus dikurangi ${r.need} (sebagian sudah terpakai). Tambah stok atau selesaikan dulu, lalu coba lagi.` };
  }
  if (r.status === "ok") {
    const ts = cancel.at, id = `${ts}-${Math.random().toString(36).slice(2, 6)}`;
    await redis.set(k("activity_logs", id), { id, ts, userId: p.user.id, userName: p.user.name,
      action: p.kind === "sale" ? "batal_penjualan" : "batal_pembelian", ref: rec.number, reason: p.reason });
    await redis.cmd("ZADD", k("activity_logs:index"), ts, k("activity_logs", id));
  }
  return { ok: true };
}
