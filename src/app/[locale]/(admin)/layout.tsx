import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { ensureSeed } from "@/lib/store/catalog";
import { redirect } from "next/navigation";
import AdminShell from "./admin-shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Validasi session sebenarnya (proxy hanya mengecek keberadaan cookie).
  let user: SessionUser | null = null;
  let failure: string | null = null;
  try {
    await ensureSeed();
    user = await getSessionUser();
  } catch (e) {
    failure = e instanceof Error ? e.message : "Database tidak dapat dihubungi";
  }
  if (failure) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
          <h1 className="mb-2 text-lg font-semibold">Aplikasi belum siap</h1>
          <p className="text-sm">{failure}</p>
          <p className="mt-2 text-sm">Setelah masalah diperbaiki, muat ulang halaman ini.</p>
        </div>
      </div>
    );
  }
  if (!user) redirect("/signin");
  return <AdminShell>{children}</AdminShell>;
}
