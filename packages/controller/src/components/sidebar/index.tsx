"use client";

import { usePathname } from "next/navigation";
import { SidebarView } from "./view";

export function Sidebar() {
  return <SidebarView pathname={usePathname()} />;
}
