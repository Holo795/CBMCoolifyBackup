import { LayoutDashboard, Server, Boxes, HardDrive, Archive, Cpu, Users, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only shown to admins (user management). */
  adminOnly?: boolean;
}

// Scheduling lives on each instance (default schedule) and resource (override),
// so there is no separate "Policies" page in the primary navigation.
export const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/instances", label: "Coolify instances", icon: Server },
  { href: "/resources", label: "Resources", icon: Boxes },
  { href: "/destinations", label: "Destinations", icon: HardDrive },
  { href: "/snapshots", label: "Snapshots", icon: Archive },
  { href: "/agents", label: "Agents", icon: Cpu },
  { href: "/users", label: "Users", icon: Users, adminOnly: true },
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];

/** NAV entries visible to a given role. Admin-only entries need role === "admin".
 *  Kept dependency-free (no server imports) so it's safe in client bundles. */
export function navFor(role: string | null | undefined): NavItem[] {
  return NAV.filter((n) => !n.adminOnly || role === "admin");
}
