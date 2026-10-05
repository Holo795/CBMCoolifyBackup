/**
 * A queued AgentJob's payload carries everything the agent needs - decrypted
 * destination credentials, AES keys, restic passwords, DB credentials. Once the
 * job is finished nothing reads it again, so it is reduced to its non-secret
 * top-level scalars (ids, type, flags) instead of being kept forever (and copied
 * into every metadata self-backup).
 */
const SECRET_KEYS = new Set([
  "decryptionKey",
  "sourceEncryptionKey",
  "targetEncryptionKey",
  "resticPassword",
  "password",
  "envEnc",
]);

export function scrubPayload(payload: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = { scrubbed: true };
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return out;
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (SECRET_KEYS.has(k)) continue;
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) out[k] = v;
  }
  return out;
}
