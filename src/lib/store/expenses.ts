import { k, redis } from "@/lib/redis";
import { applyStock, type ApplyOutcome } from "./stock";

export const EXPENSE_CATEGORIES = ["Operasional", "Listrik", "Air", "Gas", "Transportasi", "Perawatan", "Lain-lain"] as const;
export type ExpenseInput = {
  date: string; category: string; name: string; quantity: number; amount: number; note?: string;
};
type User = { id: string; name: string };

// Total = jumlah × nominal per satuan.
export const expenseTotal = (i: { quantity: number; amount: number }) => i.quantity * i.amount;

async function audit(user: User, action: string, ref: string, before: unknown, after: unknown) {
  const ts = Date.now();
  const id = `${ts}-${Math.random().toString(36).slice(2, 6)}`;
  await redis.set(k("activity_logs", id), { id, ts, userId: user.id, userName: user.name, action, ref, before, after });
  await redis.cmd("ZADD", k("activity_logs:index"), ts, k("activity_logs", id));
}

export async function createExpense(user: User, input: ExpenseInput, idemKey: string): Promise<ApplyOutcome> {
  const record = {
    id: "__ID__", number: "__NUMBER__", ...input, note: input.note?.trim() ?? "", name: input.name.trim(),
    total: expenseTotal(input), createdAt: Date.now(), createdBy: user.id, createdByName: user.name,
  };
  // Memakai skrip atomik yang sama (tanpa barang stok) untuk nomor unik + idempotensi.
  return applyStock({
    idemKey, seqName: "expense", recordPrefixName: "expenses", numberPrefix: "PG",
    record, type: "pembelian", note: "", deltas: {},
  });
}

export async function updateExpense(user: User, id: string, input: ExpenseInput) {
  const before = await redis.get<Record<string, unknown>>(k("expenses", id));
  if (!before) return null;
  const after = { ...before, ...input, name: input.name.trim(), note: input.note?.trim() ?? "",
    total: expenseTotal(input), updatedAt: Date.now() };
  await redis.set(k("expenses", id), after);
  await audit(user, "ubah_pengeluaran", String(before.number), before, after);
  return after;
}

export async function deleteExpense(user: User, id: string) {
  const before = await redis.get<Record<string, unknown>>(k("expenses", id));
  if (!before) return false;
  await redis.cmd("DEL", k("expenses", id));
  await redis.cmd("ZREM", k("expenses:index"), k("expenses", id));
  await audit(user, "hapus_pengeluaran", String(before.number), before, null);
  return true;
}

export async function listExpenses(limit = 500) {
  const keys = await redis.cmd<string[]>("ZREVRANGE", k("expenses:index"), 0, limit - 1);
  if (!keys.length) return [];
  const raw = await redis.cmd<(string | null)[]>("MGET", ...keys);
  return raw.filter((v): v is string => v != null).map((v) => JSON.parse(v));
}
