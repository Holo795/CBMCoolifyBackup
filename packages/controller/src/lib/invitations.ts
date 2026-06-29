// Re-export the pure role helpers so callers can grab them alongside invites.
export { ROLES, isRole, type Role } from "./roles";

/** Invitation links are valid for 48h by default. */
export const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

/** Absolute expiry from a base time. */
export function inviteExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITE_TTL_MS);
}

/** Minimal invite shape the signup decision needs (DB-agnostic, so it's testable). */
export interface InviteFacts {
  email: string;
  role: string;
  expiresAt: Date;
  claimedAt: Date | null;
  acceptedAt: Date | null;
}

/**
 * Pure decision for "may this email/password signup proceed?", used by the
 * Better Auth `user.create.before` gate. Allowed when:
 *  - bootstrap: there are no users yet → first account becomes admin; or
 *  - a matching invite was claimed (token proven), is still pending and
 *    unexpired, and its email matches the signup email.
 * Otherwise registration stays closed.
 */
export function decideInviteSignup(input: {
  userCount: number;
  email: string;
  invite: InviteFacts | null;
  now: Date;
}): { allow: boolean; role?: string } {
  const { userCount, email, invite, now } = input;
  if (userCount === 0) return { allow: true, role: "admin" };
  if (
    invite &&
    invite.acceptedAt === null &&
    invite.claimedAt !== null &&
    invite.expiresAt.getTime() > now.getTime() &&
    invite.email.toLowerCase() === email.toLowerCase()
  ) {
    return { allow: true, role: invite.role };
  }
  return { allow: false };
}
