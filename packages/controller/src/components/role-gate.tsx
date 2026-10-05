"use client";

import { createContext, use } from "react";
import { can, type Role } from "@/lib/roles";

/** Current user's role, provided once at the app shell (see app/(app)/layout-view). */
const RoleContext = createContext<string>("viewer");

export function RoleProvider({ role, children }: { role: string; children: React.ReactNode }) {
  return <RoleContext value={role}>{children}</RoleContext>;
}

export function useRole(): string {
  return use(RoleContext);
}

export function useCan(min: Role): boolean {
  return can({ role: use(RoleContext) }, min);
}

/**
 * Renders its children only if the current user meets `min`. Purely cosmetic —
 * every mutating action is still enforced server-side by `requireRole` — but it
 * keeps users from seeing controls they can't use.
 */
export function Gate({ min, children }: { min: Role; children: React.ReactNode }) {
  return can({ role: use(RoleContext) }, min) ? <>{children}</> : null;
}
