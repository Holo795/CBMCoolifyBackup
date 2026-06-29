"use client";

import { createContext, useContext } from "react";
import { can, type Role } from "@/lib/roles";

/** Current user's role, provided once at the app shell (see app/(app)/layout-view). */
const RoleContext = createContext<string>("viewer");

export function RoleProvider({ role, children }: { role: string; children: React.ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useRole(): string {
  return useContext(RoleContext);
}

export function useCan(min: Role): boolean {
  return can({ role: useContext(RoleContext) }, min);
}

/**
 * Renders its children only if the current user meets `min`. Purely cosmetic —
 * every mutating action is still enforced server-side by `requireRole` — but it
 * keeps users from seeing controls they can't use.
 */
export function Gate({ min, children }: { min: Role; children: React.ReactNode }) {
  return can({ role: useContext(RoleContext) }, min) ? <>{children}</> : null;
}
