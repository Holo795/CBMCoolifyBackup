import { test } from "node:test";
import assert from "node:assert/strict";
import { destinationEditProblem, editableFields, mergeDestinationConfig } from "../src/lib/destination-edit";

const ssh = {
  type: "ssh" as const,
  host: "old.example",
  port: 22,
  username: "u",
  basePath: "/srv/backups",
  password: "old-pw",
  jumpHost: "bastion.example",
  jumpPort: 22,
  jumpPassword: "jump-pw",
};
const s3 = { type: "s3" as const, bucket: "b", prefix: "cbm", region: "eu-west-3", accessKeyId: "AK1", secretAccessKey: "SK1", forcePathStyle: false };

test("an empty secret keeps the stored one; the data's place never changes", () => {
  const next = mergeDestinationConfig(ssh, { host: "new.example", port: "2222", password: "", basePath: "/elsewhere" });
  assert.equal(next.type === "ssh" && next.host, "new.example");
  assert.equal(next.type === "ssh" && next.port, 2222);
  assert.equal(next.type === "ssh" && next.password, "old-pw");
  assert.equal(next.type === "ssh" && next.basePath, "/srv/backups");
  assert.equal(next.type === "ssh" && next.jumpHost, undefined, "an empty jump host removes it");

  const rotated = mergeDestinationConfig(s3, { accessKeyId: "AK2", secretAccessKey: "SK2", bucket: "other", forcePathStyle: "on" });
  assert.deepEqual(rotated, { ...s3, accessKeyId: "AK2", secretAccessKey: "SK2", forcePathStyle: true, endpoint: undefined });
  const kept = mergeDestinationConfig(s3, { accessKeyId: "AK1", secretAccessKey: "" });
  assert.equal(kept.type === "s3" && kept.secretAccessKey, "SK1");
});

test("switching SSH from password to key, and refusing no auth at all", () => {
  const key = mergeDestinationConfig(ssh, { jumpHost: "bastion.example", clearPassword: "on", privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\r\nabc\r\n-----END OPENSSH PRIVATE KEY-----" });
  assert.equal(key.type === "ssh" && key.password, undefined);
  assert.match(key.type === "ssh" ? (key.privateKey ?? "") : "", /^-----BEGIN[^\r]*\nabc\n/);
  assert.equal(key.type === "ssh" && key.jumpPassword, "jump-pw");
  assert.equal(destinationEditProblem(mergeDestinationConfig(ssh, { clearPassword: "on" })), "messages.destinationEditNoAuth");
  assert.equal(destinationEditProblem(key), null);
});

test("the form shows no secret", () => {
  const shown = JSON.stringify([editableFields(ssh), editableFields(s3)]);
  assert.doesNotMatch(shown, /old-pw|jump-pw|SK1/);
  assert.match(shown, /"hasPassword":true/);
});
