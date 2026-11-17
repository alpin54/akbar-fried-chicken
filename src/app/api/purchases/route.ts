import { json, requireAuth } from "@/lib/api";
import { listPurchases } from "@/lib/store/purchases";

export async function GET() {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  return json({ purchases: await listPurchases(0, 200) });
}
