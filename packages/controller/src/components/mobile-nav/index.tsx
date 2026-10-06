"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { openSearch } from "@/components/sidebar";
import { MobileNavView } from "./view";

/** Mobile header + navigation drawer, shown below `md` (the sidebar takes over above). */
export function MobileNav({ role, name, email }: { role: string; name: string; email?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <MobileNavView
      open={open}
      onOpenChange={setOpen}
      pathname={usePathname()}
      role={role}
      name={name}
      email={email}
      onSearch={openSearch}
    />
  );
}
