"use client";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { HorizontalDotsIcon } from "@/icons";
import { cn } from "@/utils";
import SidebarMenuItem from "./sidebar-menu-item";
import { MenuType, NavItem } from "./types";

interface SidebarNavGroupProps {
  label: string;
  menuType: MenuType;
  items: NavItem[];
  openSubmenu: { type: MenuType; index: number } | null;
  showContent: boolean;
  pathname: string;
  onToggleSubmenu: (index: number, menuType: MenuType) => void;
}

export default function SidebarNavGroup({
  label,
  menuType,
  items,
  openSubmenu,
  showContent,
  pathname,
  onToggleSubmenu,
}: SidebarNavGroupProps) {
  return (
    <SidebarGroup className="p-0">
      <SidebarGroupLabel
        className={cn(
          "mb-4 flex h-auto p-0 text-xs leading-5 text-gray-400 uppercase",
          !showContent ? "xl:justify-center" : "justify-start",
        )}
      >
        {showContent ? label : <HorizontalDotsIcon />}
      </SidebarGroupLabel>
      <SidebarMenu className="gap-1">
        {items.map((nav, index) => (
          <SidebarMenuItem
            key={nav.key}
            nav={nav}
            isOpen={
              openSubmenu?.type === menuType && openSubmenu?.index === index
            }
            showContent={showContent}
            pathname={pathname}
            onToggle={() => onToggleSubmenu(index, menuType)}
          />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
