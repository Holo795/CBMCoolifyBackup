/**
 * Configuration problems that must stop a production controller from starting
 * instead of failing open:
 *  - the default auth secret: anyone could forge a session cookie, and secrets
 *    at rest would be encrypted with a key derived from a public string;
 *  - a MASTER_KEY that is set but not a base64 32-byte key: it was silently
 *    ignored in favour of the derived key, so fixing it later made every stored
 *    secret undecryptable.
 * Weak secrets (see secretWeaknesses) also stop a NEW install; one that has
 * already stored data keeps running, with a permanent warning to admins.
 */
export const DEFAULT_AUTH_SECRET = "dev-insecure-secret-change-me";

/** Values published in the example files and docs: never a real secret. */
const KNOWN_SECRETS = new Set([DEFAULT_AUTH_SECRET, "change-me-to-a-long-random-string", "change-me", "changeme", "secret"]);
const MIN_SECRET_LENGTH = 32;

export type SecretWeakness = "auth-secret-weak" | "master-key-derived";

/**
 * What makes the secrets of an install guessable:
 *  - an auth secret from the examples, or shorter than 32 characters;
 *  - no MASTER_KEY: every secret at rest (Coolify tokens, S3/SSH credentials,
 *    encryption and restic keys) is encrypted with a key derived from the auth
 *    secret - whoever has a copy of the database and that secret reads them.
 */
export function secretWeaknesses(env: { authSecret?: string; masterKey?: string }): SecretWeakness[] {
  const out: SecretWeakness[] = [];
  const secret = env.authSecret ?? "";
  if (KNOWN_SECRETS.has(secret.trim()) || secret.length < MIN_SECRET_LENGTH) out.push("auth-secret-weak");
  if (!(env.masterKey ?? "").trim()) out.push("master-key-derived");
  return out;
}

export function startupProblems(
  env: {
    nodeEnv?: string;
    authSecret?: string;
    masterKey?: string;
  },
  /** Nothing stored yet (no user, no instance, no destination). */
  freshInstall = false,
): string[] {
  if (env.nodeEnv !== "production") return [];
  const problems: string[] = [];
  if (freshInstall) {
    const weak = secretWeaknesses(env);
    if (weak.includes("auth-secret-weak") && env.authSecret && env.authSecret !== DEFAULT_AUTH_SECRET) {
      problems.push(
        `BETTER_AUTH_SECRET is too weak (an example value, or shorter than ${MIN_SECRET_LENGTH} characters). ` +
          "Set a long random one, e.g. `openssl rand -base64 48`.",
      );
    }
    if (weak.includes("master-key-derived")) {
      problems.push(
        "MASTER_KEY is not set: every secret CBM stores would be encrypted with a key derived from BETTER_AUTH_SECRET. " +
          "Set MASTER_KEY to a base64 32-byte key (`openssl rand -base64 32`) before the first start, and keep it safe.",
      );
    }
  }
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
