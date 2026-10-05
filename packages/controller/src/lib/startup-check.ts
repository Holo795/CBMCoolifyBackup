/**
 * Configuration problems that must stop a production controller from starting
 * instead of failing open:
 *  - the default auth secret: anyone could forge a session cookie, and secrets
 *    at rest would be encrypted with a key derived from a public string;
 *  - a MASTER_KEY that is set but not a base64 32-byte key: it was silently
 *    ignored in favour of the derived key, so fixing it later made every stored
 *    secret undecryptable.
 * An empty MASTER_KEY is allowed (the documented fallback: a key derived from
 * the auth secret).
 */
export const DEFAULT_AUTH_SECRET = "dev-insecure-secret-change-me";

export function startupProblems(env: {
  nodeEnv?: string;
  authSecret?: string;
  masterKey?: string;
}): string[] {
  if (env.nodeEnv !== "production") return [];
  const problems: string[] = [];
  if (!env.authSecret || env.authSecret === DEFAULT_AUTH_SECRET) {
    problems.push(
      "BETTER_AUTH_SECRET is not set (the public default is in use): session cookies could be forged. " +
        "Set a long random BETTER_AUTH_SECRET. If this install already ran with the default and has no MASTER_KEY, " +
        "first set MASTER_KEY to the key it has been using so stored secrets still decrypt - see docs/configuration.md.",
    );
  }
  const mk = (env.masterKey ?? "").trim();
  if (mk && Buffer.from(mk, "base64").length !== 32) {
    problems.push(
      "MASTER_KEY is set but is not a base64-encoded 32-byte key. Generate one with " +
        "`openssl rand -base64 32`, or unset MASTER_KEY to keep using the key derived from BETTER_AUTH_SECRET. " +
        "Note: secrets stored so far were encrypted with the derived key.",
    );
  }
  return problems;
}
