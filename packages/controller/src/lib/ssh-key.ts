import { normalizePrivateKey } from "@cbm/shared";

/**
 * Would the agent's OpenSSH (`ssh -i`, used by restic over SFTP) accept this
 * key? The controller's own test goes through ssh2, which is more lenient
 * (PuTTY keys, CRLF line ends), so a green Test could still mean red backups.
 * Returns null when it's fine, else why not.
 */
export async function sshKeyProblem(key: string | undefined): Promise<string | null> {
  const k = normalizePrivateKey(key);
  if (!k) return null;
  if (!/^-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----\n/.test(k)) {
    return "not an OpenSSH/PEM private key (a PuTTY .ppk must be converted with puttygen)";
  }
  // ssh2 is CommonJS: its exports sit on `default` when imported from ESM.
  type Ssh2 = typeof import("ssh2");
  const mod = (await import("ssh2")) as Ssh2 & { default?: Ssh2 };
  const utils = mod.utils ?? mod.default!.utils;
  const parsed = utils.parseKey(k);
  if (parsed instanceof Error) return parsed.message;
  // The agent runs ssh non-interactively: a passphrase can't be typed there.
  const one = Array.isArray(parsed) ? parsed[0] : parsed;
  if (one && "isPrivateKey" in one && typeof one.isPrivateKey === "function" && !one.isPrivateKey()) return "this is a public key";
  return null;
}
