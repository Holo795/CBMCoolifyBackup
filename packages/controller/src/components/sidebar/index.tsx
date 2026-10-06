"use client";

import { usePathname } from "next/navigation";
import { SidebarView } from "./view";

/** Opens the command palette (it listens for ⌘K). */
export function openSearch() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
}

export function Sidebar({ role, name, email }: { role: string; name: string; email?: string }) {
  return <SidebarView pathname={usePathname()} role={role} name={name} email={email} onSearch={openSearch} />;
}
