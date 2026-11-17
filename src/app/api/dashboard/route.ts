import { json, requireAuth } from "@/lib/api";
import { getDashboard } from "@/lib/store/reports";

export async function GET() {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  return json(await getDashboard());
}
