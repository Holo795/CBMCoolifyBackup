import { test } from "node:test";
import assert from "node:assert/strict";
import { storedHostKeys, withHostKeys, fingerprint } from "../src/lib/ssh-hostkeys";

const ssh = { type: "ssh" as const, host: "sftp.example", port: 2222, username: "u", basePath: "/b", jumpHost: "bastion.example", jumpPort: 22 };

test("a destination's known host keys go out with it, target and jump host", () => {
  const keys = storedHostKeys({ "sftp.example:2222": "ssh-ed25519 AAA", "bastion.example:22": "ssh-rsa BBB", junk: 3 } as never);
  const d = withHostKeys(ssh, keys);
  assert.equal(d.hostKey, "ssh-ed25519 AAA");
  assert.equal(d.jumpHostKey, "ssh-rsa BBB");
  assert.equal(withHostKeys(ssh, {}).hostKey, undefined);
  assert.deepEqual(storedHostKeys(null), {});
});

test("fingerprints read like OpenSSH's", () => {
  assert.match(fingerprint("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl"), /^SHA256:[A-Za-z0-9+/]{43}$/);
});
