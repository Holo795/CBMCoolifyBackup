// Re-export the pure role helpers so callers can grab them alongside invites.
export { ROLES, isRole, type Role } from "./roles";

/** Invitation links are valid for 48h by default. */
export const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

/**
 * After the link is opened (claimed), the signup gate stays open only briefly.
 * Claiming proves token possession; this window bounds how long that proof lets
 * *anyone* register the invited email, so an intercepted-then-abandoned claim
 * can't be exploited later. The invitee simply re-opens the link if it lapses.
 */
export const CLAIM_WINDOW_MS = 10 * 60 * 1000;

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
 *  - a matching invite was claimed (token proven) WITHIN the claim window, is
 *    still pending and unexpired, and its email matches the signup email.
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
    // Claim must be recent: the signup gate is only open briefly after the link
    // is opened, not for the invite's full 48h lifetime.
    now.getTime() - invite.claimedAt.getTime() <= CLAIM_WINDOW_MS &&
    invite.expiresAt.getTime() > now.getTime() &&
    invite.email.toLowerCase() === email.toLowerCase()
  ) {
    return { allow: true, role: invite.role };
  }
  return { allow: false };
}
