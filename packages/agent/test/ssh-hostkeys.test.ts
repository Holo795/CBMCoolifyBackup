import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hostKeyAlgorithms, knownHostsLine, parseKnownHosts, type Job, type ResolvedDestination } from "@cbm/shared";
import { fingerprint, hostKeysSeenFor, hostVerifier, keyFromBlob } from "../src/hostkeys.js";
import { makeTransfer } from "../src/transfer.js";
import { resticContext } from "../src/restic.js";
import { docker } from "../src/docker.js";

const DOCKER = process.env.CBM_DOCKER_TESTS === "1";

/* ------------------------------ pure ------------------------------ */

const blob = (type: string, body: string) => {
  const t = Buffer.from(type, "latin1");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(t.length);
  return Buffer.concat([len, t, Buffer.from(body)]);
};

test("a key blob reads as '<type> <base64>', fingerprinted like OpenSSH", () => {
  const b = blob("ssh-ed25519", "0123456789abcdef0123456789abcdef");
  assert.equal(keyFromBlob(b), `ssh-ed25519 ${b.toString("base64")}`);
  assert.match(fingerprint(keyFromBlob(b)), /^SHA256:[A-Za-z0-9+/]+$/);
});

test("known_hosts lines round-trip, port 22 bare and others bracketed", () => {
  const text = [knownHostsLine("sftp.example", 22, "ssh-ed25519 AAA"), knownHostsLine("10.0.0.5", 2222, "ecdsa-sha2-nistp256 BBB"), "|1|hashed|entry ssh-rsa CCC"].join("\n");
  assert.deepEqual(parseKnownHosts(text), [
    { id: "sftp.example:22", key: "ssh-ed25519 AAA" },
    { id: "10.0.0.5:2222", key: "ecdsa-sha2-nistp256 BBB" },
  ]);
});

test("the client asks for the known key's type only", () => {
  assert.deepEqual(hostKeyAlgorithms("ssh-ed25519 AAA"), ["ssh-ed25519"]);
  assert.deepEqual(hostKeyAlgorithms("ssh-rsa AAA"), ["rsa-sha2-512", "rsa-sha2-256", "ssh-rsa"]);
  assert.equal(hostKeyAlgorithms(undefined), undefined);
});

test("the verifier accepts the first key and the known one, refuses another", () => {
  const a = blob("ssh-ed25519", "key-a-key-a-key-a-key-a-key-a-12");
  const b = blob("ssh-ed25519", "key-b-key-b-key-b-key-b-key-b-12");
  assert.equal(hostVerifier("h.example", 22, undefined)(a), true);
  assert.equal(hostVerifier("h.example", 22, keyFromBlob(a))(a), true);
  assert.equal(hostVerifier("h.example", 22, keyFromBlob(a))(b), false);
});

/* ------------------------- a real SSH server ------------------------- */

async function startSshd(): Promise<{ name: string; port: number }> {
  const name = `cbm-sshd-${Date.now().toString(36)}`;
  const script =
    "apk add --no-cache openssh-server openssh-sftp-server >/dev/null && ssh-keygen -A >/dev/null && " +
    "adduser -D u && echo 'u:pw' | chpasswd && mkdir -p /home/u/data && chown u /home/u/data && " +
    "exec /usr/sbin/sshd -D -e -o PasswordAuthentication=yes";
  const r = await docker(["run", "-d", "--name", name, "-p", "127.0.0.1::22", "alpine:3.24", "sh", "-c", script]);
  assert.equal(r.code, 0, r.stderr);
  const port = Number((await docker(["port", name, "22"])).stdout.trim().split(":").pop());
  for (let i = 0; i < 60; i++) {
    const logs = await docker(["logs", name]);
    if (/Server listening/.test(logs.stdout + logs.stderr)) return { name, port };
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error("sshd never started");
}

test(
  "ssh2 and OpenSSH: the first key is learned, a different one refused",
  { skip: !DOCKER || spawnSync("sshpass", ["-V"]).status !== 0, timeout: 180_000 },
  async () => {
    const sshd = await startSshd();
    const dir = await mkdtemp(join(tmpdir(), "cbm-hostkeys-"));
    const dest = { type: "ssh", host: "127.0.0.1", port: sshd.port, username: "u", password: "pw", basePath: "/home/u/data", jumpPort: 22 } as Extract<
      ResolvedDestination,
      { type: "ssh" }
    >;
    const seenFor = (d: typeof dest) => hostKeysSeenFor({ type: "prune", destination: d } as unknown as Job) ?? {};
    const id = `127.0.0.1:${sshd.port}`;
    try {
      // ssh2 (tar engine): no key known -> connects, learns it.
      const t = await makeTransfer(dest);
      await t.list("");
      await t.close();
      const learned = seenFor(dest)[id];
      assert.ok(learned, "the key offered was recorded");
      // Known key: still connects. Another key of the same type: refused.
      const t2 = await makeTransfer({ ...dest, hostKey: learned });
      await t2.close();
      // A real key of the same type, not the server's (an invalid line would be
      // ignored by OpenSSH, not compared).
      const type = learned.split(" ")[0]!.replace(/^ssh-/, "").replace(/^ecdsa-sha2-nistp\d+$/, "ecdsa");
      spawnSync("ssh-keygen", ["-q", "-t", type, "-N", "", "-f", join(dir, "other")]);
      const forged = (await readFile(join(dir, "other.pub"), "utf8")).trim().split(/\s+/).slice(0, 2).join(" ");
      await assert.rejects(makeTransfer({ ...dest, hostKey: forged }), /host key .* changed/i);

      // OpenSSH (restic engine): the connect script with no key learns one...
      const ctx = await resticContext(dest, "x", dir);
      const run = spawnSync("sh", [ctx.args[1]!.replace("sftp.command=", "")], { input: "", encoding: "utf8", timeout: 30_000 });
      await ctx.cleanup();
      assert.notEqual(run.status, 255, run.stderr);
      assert.ok(seenFor(dest)[id], "OpenSSH's accepted key was read back");
      // ...accepts the key ssh2 learned (same type asked for, same key)...
      const known = await resticContext({ ...dest, hostKey: learned }, "x", dir);
      const ok = spawnSync("sh", [known.args[1]!.replace("sftp.command=", "")], { input: "", encoding: "utf8", timeout: 30_000 });
      await known.cleanup();
      assert.notEqual(ok.status, 255, ok.stderr);
      // ...and refuses a different key.
      const strict = await resticContext({ ...dest, hostKey: forged }, "x", dir);
      const refused = spawnSync("sh", [strict.args[1]!.replace("sftp.command=", "")], { input: "", encoding: "utf8", timeout: 30_000 });
      await strict.cleanup();
      assert.equal(refused.status, 255);
      assert.match(refused.stderr, /REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed/);
    } finally {
      await docker(["rm", "-f", sshd.name]);
      await rm(dir, { recursive: true, force: true });
    }
  },
);
