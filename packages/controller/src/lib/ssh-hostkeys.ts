import { createHash } from "node:crypto";
import type { ServerHostKeyAlgorithm } from "ssh2";
import { hostKeyAlgorithms, sshHostId, type ResolvedDestination } from "@cbm/shared";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { decryptSecret } from "./crypto";

/**
 * SSH host keys of the destinations (S-03). Each destination keeps the key of
 * its server and of its jump host, learned at the first connection (a test, a
 * job, the self-backup) and then required: a server offering another key is
 * refused - someone may be in the middle. An admin forgets the known keys when
 * the server really changed; the next connection learns the new ones.
 */
type Ssh = Extract<ResolvedDestination, { type: "ssh" }>;
export type HostKeys = Record<string, string>;

export function storedHostKeys(raw: Prisma.JsonValue | null | undefined): HostKeys {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string"));
}

/** The known keys of a destination, on its resolved config (sent to agents). */
export function withHostKeys(d: Ssh, keys: HostKeys): Ssh {
  const hostKey = keys[sshHostId(d.host, d.port)];
  const jumpHostKey = d.jumpHost ? keys[sshHostId(d.jumpHost, d.jumpPort)] : undefined;
  return { ...d, ...(hostKey ? { hostKey } : {}), ...(jumpHostKey ? { jumpHostKey } : {}) };
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

const same = (a: string, b: string) => a.trim().split(/\s+/).slice(0, 2).join(" ") === b.trim().split(/\s+/).slice(0, 2).join(" ");

/** ssh2's hostVerifier: records the key offered in `seen`, refuses one other than `expected`. */
export function verifier(host: string, port: number | undefined, expected: string | undefined, seen: HostKeys, refused: string[]) {
  return (blob: Buffer): boolean => {
    const key = keyFromBlob(blob);
    seen[sshHostId(host, port)] = key;
    if (!expected || same(expected, key)) return true;
    refused.push(`${host}:${port ?? 22} (expected ${fingerprint(expected)}, offered ${fingerprint(key)})`);
    return false;
  };
}

/**
 * Keep the keys seen for the hosts of SSH destinations that don't know one
 * yet (a known key is never replaced here: only an admin forgets it).
 */
export async function learnHostKeys(seen: HostKeys | undefined): Promise<void> {
  if (!seen || Object.keys(seen).length === 0) return;
  const dests = await prisma.destination.findMany({ where: { type: "ssh" }, select: { id: true, configEnc: true, sshHostKeys: true } });
  for (const d of dests) {
    let cfg: Ssh;
    try {
      cfg = JSON.parse(decryptSecret(d.configEnc)) as Ssh;
    } catch {
      continue;
    }
    const known = storedHostKeys(d.sshHostKeys);
    const ids = [sshHostId(cfg.host, cfg.port), ...(cfg.jumpHost ? [sshHostId(cfg.jumpHost, cfg.jumpPort)] : [])];
    const learned: HostKeys = {};
    for (const id of ids) if (!known[id] && seen[id]) learned[id] = seen[id];
    if (Object.keys(learned).length === 0) continue;
    // Only if nothing was stored meanwhile for these hosts (two results racing).
    await prisma.$transaction(async (tx) => {
      const now = storedHostKeys((await tx.destination.findUnique({ where: { id: d.id }, select: { sshHostKeys: true } }))?.sshHostKeys);
      const add = Object.fromEntries(Object.entries(learned).filter(([id]) => !now[id]));
      if (Object.keys(add).length) await tx.destination.update({ where: { id: d.id }, data: { sshHostKeys: { ...now, ...add } } });
    });
  }
}

/**
 * Connect an SFTP client to a destination (through its jump host if any),
 * enforcing its known host keys; the keys offered land in `seen`.
 */
export async function connectSftp(dest: Ssh, seen: HostKeys = {}): Promise<{ client: import("ssh2-sftp-client"); close: () => Promise<void> }> {
  const mod = await import("ssh2-sftp-client");
  const client = new mod.default();
  const refused: string[] = [];
  const fail = (e: unknown) => {
    if (refused.length) {
      throw new Error(
        `SSH host key changed for ${refused.join(", ")}: connection refused. If the server was reinstalled or its key rotated, forget the known keys on the Destinations page.`,
      );
    }
    throw e;
  };
  const auth = { username: dest.username, password: dest.password, privateKey: dest.privateKey };
  let jump: import("ssh2").Client | null = null;
  if (dest.jumpHost) {
    const { Client } = await import("ssh2");
    jump = new Client();
    const j = jump;
    await new Promise<void>((resolve, reject) => {
      j.on("ready", () => resolve())
        .on("error", reject)
        .connect({
          host: dest.jumpHost,
          port: dest.jumpPort,
          username: dest.jumpUsername || dest.username,
          password: dest.jumpPassword || dest.password,
          privateKey: dest.jumpPrivateKey || dest.privateKey,
          hostVerifier: verifier(dest.jumpHost!, dest.jumpPort, dest.jumpHostKey, seen, refused),
          ...algorithmsFor(dest.jumpHostKey),
        });
    }).catch(fail);
    const sock = await new Promise<import("stream").Duplex>((resolve, reject) => {
      j.forwardOut("127.0.0.1", 0, dest.host, dest.port, (err, stream) => (err ? reject(err) : resolve(stream)));
    });
    await client
      .connect({ sock, ...auth, hostVerifier: verifier(dest.host, dest.port, dest.hostKey, seen, refused), ...algorithmsFor(dest.hostKey) })
      .catch(fail);
  } else {
    await client
      .connect({
        host: dest.host,
        port: dest.port,
        ...auth,
        hostVerifier: verifier(dest.host, dest.port, dest.hostKey, seen, refused),
        ...algorithmsFor(dest.hostKey),
      })
      .catch(fail);
  }
  return {
    client,
    close: async () => {
      await client.end().catch(() => undefined);
      jump?.end();
    },
  };
}

/** ssh2's connect options asking for the known key's type (see hostKeyAlgorithms). */
function algorithmsFor(known: string | undefined): { algorithms?: { serverHostKey: ServerHostKeyAlgorithm[] } } {
  const list = hostKeyAlgorithms(known);
  return list ? { algorithms: { serverHostKey: list as ServerHostKeyAlgorithm[] } } : {};
}
