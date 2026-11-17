import { json, requireAuth } from "@/lib/api";
import { listMovements } from "@/lib/store/stock";

export async function GET(req: Request) {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  const item = new URL(req.url).searchParams.get("itemId") ?? undefined;
  if (item !== undefined && !/^[a-z0-9_]+$/.test(item)) return json({ error: "Barang tidak valid" }, 400);
  return json({ movements: await listMovements(0, 300, item) });
}
