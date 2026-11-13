import { NextResponse } from "next/server";
import { getSession } from "./session";
import { getTwoFactorPolicy, twoFactorRequired } from "./two-factor";

/**
 * The signed-in user for a route handler (the browser's session), with the
 * same two-factor policy as the pages (requireUser): an account the policy
 * requires 2FA from gets nothing until it has set it up. Route handlers only
 * checked the session - an admin without 2FA could still download the
 * recovery file, any account read job logs.
 */
export async function apiSessionUser(): Promise<
  | { user: NonNullable<Awaited<ReturnType<typeof getSession>>>["user"]; error?: undefined }
  | { user?: undefined; error: NextResponse }
> {
  const session = await getSession();
  if (!session?.user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (!session.user.twoFactorEnabled && twoFactorRequired(await getTwoFactorPolicy(), session.user.role)) {
    return { error: NextResponse.json({ error: "two-factor authentication must be set up first" }, { status: 403 }) };
  }
  return { user: session.user };
}
