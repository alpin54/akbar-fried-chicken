import { json, requireAuth } from "@/lib/api";
import { listInventory } from "@/lib/store/stock";

export async function GET() {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  return json({ items: await listInventory() });
}
