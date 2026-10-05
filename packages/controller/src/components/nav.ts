import { LayoutDashboard, Server, Boxes, HardDrive, Archive, Cpu, Users, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  /** i18n key (see i18n/dictionaries/nav.ts), translated at render time. */
  labelKey: string;
  icon: LucideIcon;
  /** Only shown to admins (user management). */
  adminOnly?: boolean;
}

// Scheduling lives on each instance (default schedule) and resource (override),
// so there is no separate "Policies" page in the primary navigation.
export const NAV: NavItem[] = [
  { href: "/", labelKey: "nav.overview", icon: LayoutDashboard },
  { href: "/instances", labelKey: "nav.instances", icon: Server },
  { href: "/resources", labelKey: "nav.resources", icon: Boxes },
  { href: "/destinations", labelKey: "nav.destinations", icon: HardDrive },
  { href: "/snapshots", labelKey: "nav.snapshots", icon: Archive },
  { href: "/agents", labelKey: "nav.agents", icon: Cpu },
  { href: "/users", labelKey: "nav.users", icon: Users, adminOnly: true },
  { href: "/settings", labelKey: "nav.settings", icon: Settings, adminOnly: true },
];

/** NAV entries visible to a given role. Admin-only entries need role === "admin".
 *  Kept dependency-free (no server imports) so it's safe in client bundles. */
export function navFor(role: string | null | undefined): NavItem[] {
  return NAV.filter((n) => !n.adminOnly || role === "admin");
}
