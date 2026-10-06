import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { ROLE_RANK, roleRank } from "./roles";
import { UserError } from "./user-error";
import { getTwoFactorPolicy, twoFactorRequired } from "./two-factor";

// Re-export the pure role helpers so server code can keep importing from here.
export { ROLE_RANK, ROLES, roleRank, can, isRole, type Role } from "./roles";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireUser() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  // An account the admin policy requires 2FA from must set it up before using
  // anything (pages and server actions alike all come through here).
  if (!session.user.twoFactorEnabled && twoFactorRequired(await getTwoFactorPolicy(), session.user.role)) {
    redirect("/two-factor/setup");
  }
  return session.user;
}

/**
 * Require at least `min`. Returns the user when allowed; throws otherwise.
 * Server-side enforcement is the source of truth — the UI also hides controls
 * for insufficient roles, so a throw here only happens on a direct/bypass call.
 */
export async function requireRole(min: "operator" | "admin") {
  const user = await requireUser();
  if (roleRank(user.role) < ROLE_RANK[min]) {
    throw new UserError("messages.noPermission");
  }
  return user;
}
