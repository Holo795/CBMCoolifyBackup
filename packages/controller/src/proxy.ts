import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/** Lightweight gate: redirect unauthenticated users away from the app shell. */
export function proxy(req: NextRequest) {
  const cookie = getSessionCookie(req);
  if (!cookie) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Protect everything except auth, login, static assets, the agent API and the
  // programmatic /api/v1 surface (both authenticate with a bearer token, not a
  // session cookie), the public /install.sh agent installer script and the app
  // icons (requested by the browser before anyone signs in). The two-factor
  // pages check access themselves: the code page runs before a session exists.
  matcher: [
    "/((?!api/auth|api/agents|api/v1|api/health|login|reset-password|invite|two-factor|install.sh|_next/static|_next/image|favicon.ico|icon.svg).*)",
  ],
};
