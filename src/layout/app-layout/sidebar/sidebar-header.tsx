"use client";

import { SidebarHeader } from "@/components/ui/sidebar";
import { Link } from "@/i18n/navigation";
import { cn } from "@/utils";
import Image from "next/image";

interface AppSidebarHeaderProps {
  showContent: boolean;
}

export default function AppSidebarHeader({
  showContent,
}: AppSidebarHeaderProps) {
  const appName =
    process.env.NEXT_PUBLIC_APP_NAME ?? "Fried Chicken Management";
  return (
    <SidebarHeader className="px-5 py-8">
      <Link
        href="/"
        className={cn(
          "flex items-center gap-3",
          !showContent ? "justify-center" : "justify-start",
        )}
      >
        <Image
          className="rounded-lg"
          width={40}
          height={40}
          src="/images/logo/logo.png"
          alt="Logo"
        />
        {/* <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#E71201] text-lg font-bold text-white"
        >
          FC
        </span> */}
        {showContent && (
          <span className="text-base leading-tight font-semibold text-gray-800 dark:text-white/90">
            {appName}
          </span>
        )}
      </Link>
    </SidebarHeader>
  );
}
