import { json, requireAuth } from "@/lib/api";
import { getReport } from "@/lib/store/reports";

const D = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  const u = new URL(req.url);
  const from = u.searchParams.get("from") ?? "";
  const to = u.searchParams.get("to") ?? "";
  if (!D.test(from) || !D.test(to) || from > to) return json({ error: "Periode tidak valid" }, 400);
  if ((Date.parse(to) - Date.parse(from)) / 86400_000 > 365) return json({ error: "Periode maksimal 1 tahun" }, 400);
  return json(await getReport(from, to));
}
