import { z } from "zod";
import { idemKey, json, requireAuth } from "@/lib/api";
import { createExpense, listExpenses } from "@/lib/store/expenses";

const expenseBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(100),
  quantity: z.number().int().min(1).max(100000),
  amount: z.number().int().min(0).max(1_000_000_000),
  note: z.string().max(300).optional(),
});

export async function GET() {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  return json({ expenses: await listExpenses() });
}

export async function POST(req: Request) {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  const key = idemKey(req);
  if (key instanceof Response) return key;
  const parsed = expenseBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Data pengeluaran tidak valid" }, 400);
  const out = await createExpense(user, parsed.data, key);
  return out.ok ? json({ expense: out.record, duplicate: out.duplicate }, out.duplicate ? 200 : 201)
                : json({ error: out.error }, out.status);
}
