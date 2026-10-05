import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/** Lightweight gate: redirect unauthenticated users away from the app shell. */
export function middleware(req: NextRequest) {
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
  // session cookie), and the public /install.sh agent installer script.
  matcher: ["/((?!api/auth|api/agents|api/v1|login|reset-password|invite|install.sh|_next/static|_next/image|favicon.ico).*)"],
};
