import { z } from "zod";
import { json, requireAuth } from "@/lib/api";
import { k, redis } from "@/lib/redis";

type Outlet = { name: string; address: string; phone: string; logoUrl: string };
const DEFAULT: Outlet = { name: process.env.NEXT_PUBLIC_APP_NAME ?? "Fried Chicken", address: "", phone: "", logoUrl: "" };

export async function GET() {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  return json({ outlet: (await redis.get<Outlet>(k("settings", "outlet"))) ?? DEFAULT });
}

const body = z.object({
  name: z.string().trim().min(1).max(80),
  address: z.string().trim().max(200),
  phone: z.string().trim().max(30),
  logoUrl: z.string().trim().max(300).refine((v) => v === "" || /^https:\/\//.test(v), "Alamat logo harus diawali https://"),
});

export async function PUT(req: Request) {
  const user = await requireAuth();
  if (user instanceof Response) return user;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Data outlet tidak valid" }, 400);
  await redis.set(k("settings", "outlet"), parsed.data);
  return json({ outlet: parsed.data });
}
