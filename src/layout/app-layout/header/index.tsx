"use client";

import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { Link } from "@/i18n/navigation";
import { MenuTwoIcon, XIcon } from "@/icons";
import ThemeToggleButton from "@/layout/header/theme-toggler";
import UserMenu from "@/layout/header/user-menu";
import Image from "next/image";

export default function AppHeader() {
  const { openMobile, toggleSidebar } = useSidebar();
  const appName =
    process.env.NEXT_PUBLIC_APP_NAME ?? "Fried Chicken Management";

  return (
    <header className="sticky top-0 z-50 flex w-full shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-3 py-3 xl:px-6 xl:py-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="text-gray-500 lg:size-11 dark:text-gray-400"
          onClick={toggleSidebar}
          aria-label="Buka atau tutup menu"
        >
          {openMobile ? (
            <XIcon className="size-6" />
          ) : (
            <MenuTwoIcon className="size-auto!" />
          )}
        </Button>
        <Link
          href="/"
          className="font-semibold text-gray-800 xl:hidden dark:text-white/90"
        >
          <Image
            style={{ objectFit: "cover", width: "40px", height: "40px" }}
            className="rounded-lg"
            width={48}
            height={48}
            src="/images/logo/logo.png"
            alt="Logo"
          />
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <UserMenu />
        <ThemeToggleButton />
      </div>
    </header>
  );
}
