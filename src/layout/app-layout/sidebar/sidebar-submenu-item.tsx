"use client";

import { Link } from "@/i18n/navigation";
import { cn } from "@/utils";
import { SubItem } from "./types";

interface SidebarSubmenuItemProps {
  subItem: SubItem;
  isActive: boolean;
}

export default function SidebarSubmenuItem({
  subItem,
  isActive,
}: SidebarSubmenuItemProps) {

  return (
    <li>
      <Link
        href={subItem.path}
        target={subItem.target}
        className={cn(
          "group menu-dropdown-item",
          isActive
            ? "menu-dropdown-item-active"
            : "menu-dropdown-item-inactive",
        )}
      >
        {subItem.label}
        <span className="ms-auto flex items-center gap-1">
          {subItem.new && (
            <span
              className={cn(
                "ms-auto menu-dropdown-badge",
                isActive
                  ? "menu-dropdown-badge-active"
                  : "menu-dropdown-badge-inactive",
              )}
            >
              Baru
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}
