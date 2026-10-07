import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ssh2 from "ssh2";

const { utils } = ssh2;
import { normalizePrivateKey } from "@cbm/shared";
import { resticContext } from "../src/restic.js";

const hasSshKeygen = spawnSync("ssh-keygen", ["-?"]).error === undefined;
/** Can OpenSSH read this key file? (what `ssh -i` does on the agent) */
const opensshReads = (file: string) => spawnSync("ssh-keygen", ["-y", "-f", file], { encoding: "utf8" }).status === 0;

test("a private key pasted with CRLF line ends is normalised", () => {
  assert.equal(normalizePrivateKey("-----BEGIN X-----\r\nabc\r\n-----END X-----\r\n\r\n"), "-----BEGIN X-----\nabc\n-----END X-----\n");
  assert.equal(normalizePrivateKey("a\rb"), "a\nb\n");
  assert.equal(normalizePrivateKey("  \r\n "), undefined);
  assert.equal(normalizePrivateKey(undefined), undefined);
});

test("restic over SFTP gets an ed25519 key OpenSSH can read, even saved with CRLF", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cbm-key-"));
  try {
    const crlf = utils.generateKeyPairSync("ed25519").private.replace(/\n/g, "\r\n");
    if (hasSshKeygen) {
      // The bug: OpenSSH refuses the CRLF key ("error in libcrypto").
      await writeFile(join(dir, "raw"), crlf, { mode: 0o600 });
      assert.equal(opensshReads(join(dir, "raw")), false);
    }
    const ctx = await resticContext(
      { type: "ssh", host: "h", port: 22, username: "u", basePath: "/b", privateKey: crlf } as never,
      "pw",
      dir,
    );
    try {
      const script = await readFile(ctx.args[1].replace("sftp.command=", ""), "utf8");
      const keyFile = /'-i' '([^']+)'/.exec(script)?.[1];
      assert.ok(keyFile, "the connect script passes the key with -i");
      const written = await readFile(keyFile!, "utf8");
      assert.ok(!written.includes("\r") && written.endsWith("\n"));
      if (hasSshKeygen) assert.equal(opensshReads(keyFile!), true);
    } finally {
      await ctx.cleanup();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
