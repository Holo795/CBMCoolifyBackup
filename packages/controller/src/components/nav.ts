import { LayoutDashboard, Server, Boxes, HardDrive, Archive, Cpu, Users, Settings, type LucideIcon } from "lucide-react";

export type NavGroup = "monitor" | "infrastructure" | "admin";

export interface NavItem {
  href: string;
  /** Sidebar section (labelled with nav.groups.<group>). */
  group: NavGroup;
  /** i18n key (see i18n/dictionaries/nav.ts), translated at render time. */
  labelKey: string;
  icon: LucideIcon;
  /** Only shown to admins (user management). */
  adminOnly?: boolean;
}

// Scheduling lives on each instance (default schedule) and resource (override),
// so there is no separate "Policies" page in the primary navigation.
export const NAV: NavItem[] = [
  { href: "/", labelKey: "nav.overview", icon: LayoutDashboard, group: "monitor" },
  { href: "/snapshots", labelKey: "nav.snapshots", icon: Archive, group: "monitor" },
  { href: "/resources", labelKey: "nav.resources", icon: Boxes, group: "monitor" },
  { href: "/instances", labelKey: "nav.instances", icon: Server, group: "infrastructure" },
  { href: "/destinations", labelKey: "nav.destinations", icon: HardDrive, group: "infrastructure" },
  { href: "/agents", labelKey: "nav.agents", icon: Cpu, group: "infrastructure" },
  { href: "/users", labelKey: "nav.users", icon: Users, adminOnly: true, group: "admin" },
  { href: "/settings", labelKey: "nav.settings", icon: Settings, adminOnly: true, group: "admin" },
];

export const NAV_GROUPS: NavGroup[] = ["monitor", "infrastructure", "admin"];

/** Is `href` the current section? ("/" only matches itself.) */
export function isActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** NAV entries visible to a given role. Admin-only entries need role === "admin".
 *  Kept dependency-free (no server imports) so it's safe in client bundles. */
export function navFor(role: string | null | undefined): NavItem[] {
  return NAV.filter((n) => !n.adminOnly || role === "admin");
}
