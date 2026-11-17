import { json, requireAuth } from "@/lib/api";
import { listMovements } from "@/lib/store/stock";

export async function GET() {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  return json({ movements: await listMovements(0, 300) });
}
