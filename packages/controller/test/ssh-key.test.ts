import { test } from "node:test";
import assert from "node:assert/strict";
import ssh2 from "ssh2";

const { utils } = ssh2;
import { sshKeyProblem } from "../src/lib/ssh-key";

test("the destination test flags keys the agent's OpenSSH can't use", async () => {
  const ed = utils.generateKeyPairSync("ed25519");
  assert.equal(await sshKeyProblem(ed.private.replace(/\n/g, "\r\n")), null, "CRLF is fine once normalised");
  assert.equal(await sshKeyProblem(undefined), null, "password auth: no key to check");
  assert.match((await sshKeyProblem("PuTTY-User-Key-File-3: ssh-ed25519\nEncryption: none\n"))!, /PuTTY/);
  const locked = utils.generateKeyPairSync("ed25519", { passphrase: "secret", cipher: "aes256-ctr", rounds: 16 });
  assert.ok(await sshKeyProblem(locked.private), "a passphrase can't be typed by the agent");
  assert.ok(await sshKeyProblem("-----BEGIN OPENSSH PRIVATE KEY-----\nnot-a-key\n-----END OPENSSH PRIVATE KEY-----\n"));
});
