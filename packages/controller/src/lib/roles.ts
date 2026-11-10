/**
 * Pure role model — no server imports, so it's safe in client bundles too.
 * Higher rank = more capability.
 *  - viewer: read-only, no mutating action.
 *  - operator: viewer + run backups/restores and snapshot lifecycle.
 *  - admin: everything + configure (instances, destinations, schedules, agents,
 *    settings) and manage users/invitations.
 */
export const ROLE_RANK = { viewer: 0, operator: 1, admin: 2 } as const;
export type Role = keyof typeof ROLE_RANK;

export const ROLES = Object.keys(ROLE_RANK) as Role[];

/** Narrow an arbitrary string to a known Role. Own keys only: `in` would also
 * accept what every object inherits ("toString", "constructor"...). */
export function isRole(value: string): value is Role {
  return Object.hasOwn(ROLE_RANK, value);
}

/** Rank of a (possibly unknown/legacy) role string; unknown → viewer (safest). */
export function roleRank(role?: string | null): number {
  return role != null && isRole(role) ? ROLE_RANK[role] : ROLE_RANK.viewer;
}

/** Does this user meet the minimum role? For conditional rendering. */
export function can(user: { role?: string | null } | null | undefined, min: Role): boolean {
  if (!user) return false;
  return roleRank(user.role) >= ROLE_RANK[min];
}
