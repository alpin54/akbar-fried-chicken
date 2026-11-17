import React from "react";

export type MenuType = string;

export interface SubItem {
  label: string;
  path: string;
  new?: boolean;
  target?: string;
}

export interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  path?: string;
  new?: boolean;
  target?: string;
  subItems?: SubItem[];
}

export interface NavSection {
  type: string;
  label: string;
  items: NavItem[];
}
