import { prisma } from "./prisma";
import { randomToken, sha256Hex } from "./crypto";

/**
 * The first account (the admin) needs a setup token. Without it, whoever
 * reached the URL first between the deploy and the operator became admin.
 * The token is SETUP_TOKEN, else a random one generated at each start while
 * no account exists, printed in the controller's logs. Only its hash is kept.
 */
export { SETUP_TOKEN_HEADER } from "./setup-shared";
/** How long an attempt holds the token for its email (a failed sign-up can be
 * retried with the same email; another email waits this long). */
const HOLD_MS = 2 * 60_000;

/** At startup: while no account exists, set the token and log how to use it. */
export async function ensureSetupToken(baseUrl: string): Promise<void> {
  if ((await prisma.user.count()) > 0) {
    await prisma.setupState.deleteMany({});
    return;
  }
  const fromEnv = (process.env.SETUP_TOKEN ?? "").trim();
  const token = fromEnv || `setup_${randomToken(24)}`;
  await prisma.setupState.upsert({
    where: { id: "global" },
    create: { id: "global", tokenHash: sha256Hex(token) },
    update: { tokenHash: sha256Hex(token), email: null, usedAt: null },
  });
  const url = `${baseUrl.replace(/\/$/, "")}/login`;
  console.warn(
    fromEnv
      ? `[setup] No account yet: create the admin at ${url} with the setup token from SETUP_TOKEN.`
      : `[setup] No account yet: create the admin at ${url}?setup=${token} (setup token: ${token}). A new token is generated at each start until then.`,
  );
}

/**
 * A sign-up presenting the token: holds it for this email (atomically: of two
 * attempts racing, one wins). False when the token is wrong or held by
 * another email in the last two minutes.
 */
export async function holdSetupToken(token: string, email: string, now = new Date()): Promise<boolean> {
  if (!token) return false;
  const held = await prisma.setupState.updateMany({
    where: {
      id: "global",
      tokenHash: sha256Hex(token),
      OR: [
        { usedAt: null },
        { usedAt: { lt: new Date(now.getTime() - HOLD_MS) } },
        { email: { equals: email, mode: "insensitive" } },
      ],
    },
    data: { email, usedAt: now },
  });
  return held.count === 1;
}

/** May this email create the first account? Only right after holding the token. */
export async function setupAuthorizes(email: string, now = new Date()): Promise<boolean> {
  const s = await prisma.setupState.findUnique({ where: { id: "global" } });
  return (
    !!s?.tokenHash &&
    !!s.email &&
    s.email.toLowerCase() === email.toLowerCase() &&
    !!s.usedAt &&
    now.getTime() - s.usedAt.getTime() <= HOLD_MS
  );
}

/** The first account exists: the token is spent. */
export async function clearSetupToken(): Promise<void> {
  await prisma.setupState.deleteMany({});
}
