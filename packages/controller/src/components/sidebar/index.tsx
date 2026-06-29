"use client";

import { usePathname } from "next/navigation";
import { SidebarView } from "./view";

export function Sidebar({ role }: { role: string }) {
  return <SidebarView pathname={usePathname()} role={role} />;
}
