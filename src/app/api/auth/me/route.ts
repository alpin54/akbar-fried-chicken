import { json, requireAuth } from "@/lib/api";

export async function GET() {
  const user = await requireAuth();
  return user instanceof Response ? user : json({ user });
}
