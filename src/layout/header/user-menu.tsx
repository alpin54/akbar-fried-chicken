"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { LogOutIcon } from "@/icons";

export default function UserMenu() {
  const [name, setName] = useState<string | null>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { user?: { name: string } } | null) =>
        setName(d?.user?.name ?? null),
      )
      .catch(() => {});
  }, []);

  const logout = async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/signin");
      router.refresh();
    }
  };

  return (
    <div className="flex items-center gap-3">
      {name && (
        <span className="hidden text-sm font-medium text-gray-700 sm:inline dark:text-gray-300">
          {name}
        </span>
      )}
      <Button variant="default" size="lg" onClick={logout} disabled={busy}>
        <LogOutIcon className="size-5" />
        {busy ? "Keluar..." : "Keluar"}
      </Button>
    </div>
  );
}
