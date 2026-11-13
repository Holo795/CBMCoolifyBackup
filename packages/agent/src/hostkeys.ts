import { createHash } from "node:crypto";
import type { ServerHostKeyAlgorithm } from "ssh2";
import { hostKeyAlgorithms, sshHostId, type Job, type ResolvedDestination } from "@cbm/shared";

/**
 * SSH host keys. The controller sends the key it knows for each SSH host of a
 * job; a host offering another one is refused (someone may be in the middle),
 * one with none known yet is accepted and its key reported back with the job's
 * result, for the controller to keep (trust on first use). Before, any key was
 * accepted on every connection.
 */
const seen = new Map<string, string>();

export function recordHostKey(host: string, port: number | undefined, key: string): void {
  seen.set(sshHostId(host, port), key);
}

/** "<type> <base64>" from the raw key blob ssh2 hands its hostVerifier. */
export function keyFromBlob(blob: Buffer): string {
  const len = blob.length >= 4 ? blob.readUInt32BE(0) : 0;
  const type = len > 0 && len < 64 && blob.length >= 4 + len ? blob.subarray(4, 4 + len).toString("latin1") : "ssh-unknown";
  return `${type} ${blob.toString("base64")}`;
}

/** OpenSSH's SHA256 fingerprint of a "<type> <base64>" key. */
export function fingerprint(key: string): string {
  const b64 = key.split(/\s+/)[1] ?? "";
  return `SHA256:${createHash("sha256").update(Buffer.from(b64, "base64")).digest("base64").replace(/=+$/, "")}`;
}

/**
 * ssh2's hostVerifier for one host: records what it's offered, accepts it
 * when nothing is known or it's the known key, refuses a different one.
 */
export function hostVerifier(host: string, port: number | undefined, expected: string | undefined) {
  return (blob: Buffer): boolean => {
    const key = keyFromBlob(blob);
    recordHostKey(host, port, key);
    if (!expected || sameKey(expected, key)) return true;
    hostKeyMismatches.set(sshHostId(host, port), { expected, offered: key });
    return false;
  };
}

/** Hosts that offered a key other than the known one (for the error message). */
const hostKeyMismatches = new Map<string, { expected: string; offered: string }>();

/** A clear error for a connection refused because the host key changed. */
export function hostKeyChangedError(host: string, port: number | undefined): Error | null {
  const m = hostKeyMismatches.get(sshHostId(host, port));
  if (!m) return null;
  return new Error(
    `SSH host key of ${host}:${port ?? 22} changed (expected ${fingerprint(m.expected)}, offered ${fingerprint(m.offered)}): ` +
      "connection refused. If the server was reinstalled or its key rotated, accept the new key on the Destinations page.",
  );
}

function sameKey(a: string, b: string): boolean {
  return a.trim().split(/\s+/).slice(0, 2).join(" ") === b.trim().split(/\s+/).slice(0, 2).join(" ");
}

/** The SSH destinations a job connects to. */
export function sshDestinationsOf(job: Job): Array<Extract<ResolvedDestination, { type: "ssh" }>> {
  const out: Array<Extract<ResolvedDestination, { type: "ssh" }>> = [];
  for (const v of Object.values(job as Record<string, unknown>)) {
    if (v && typeof v === "object" && (v as { type?: unknown }).type === "ssh" && typeof (v as { host?: unknown }).host === "string") {
      out.push(v as Extract<ResolvedDestination, { type: "ssh" }>);
    }
  }
  return out;
}

/** The keys seen for a job's SSH hosts, to report with its result. */
export function hostKeysSeenFor(job: Job): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const d of sshDestinationsOf(job)) {
    for (const id of [sshHostId(d.host, d.port), ...(d.jumpHost ? [sshHostId(d.jumpHost, d.jumpPort)] : [])]) {
      const k = seen.get(id);
      if (k) out[id] = k;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/** ssh2's connect options asking for the known key's type (see hostKeyAlgorithms). */
export function algorithmsFor(known: string | undefined): { algorithms?: { serverHostKey: ServerHostKeyAlgorithm[] } } {
  const list = hostKeyAlgorithms(known);
  return list ? { algorithms: { serverHostKey: list as ServerHostKeyAlgorithm[] } } : {};
}
