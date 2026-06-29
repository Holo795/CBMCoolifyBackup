"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MobileNavView } from "./view";

/** Hamburger menu + slide-out navigation drawer, shown only below `md` (the
 * fixed sidebar takes over at `md` and up). */
export function MobileNav({ role }: { role: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <MobileNavView open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} pathname={pathname} role={role} />
  );
}
