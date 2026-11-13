import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAgentToken, saveAgentToken } from "../src/identity.js";

test("the agent keeps its credential, readable by its owner only, for its controller", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cbm-identity-"));
  try {
    assert.equal(await loadAgentToken(dir, "https://cbm.example"), null);
    await saveAgentToken(dir, "https://cbm.example", "tok-1");
    assert.equal(await loadAgentToken(dir, "https://cbm.example"), "tok-1");
    assert.equal((await stat(join(dir, "agent-identity.json"))).mode & 0o777, 0o600);
    // Pointed at another controller: enrolls there instead.
    assert.equal(await loadAgentToken(dir, "https://other.example"), null);
    // Replaced, not appended.
    await saveAgentToken(dir, "https://cbm.example", "tok-2");
    assert.equal(await loadAgentToken(dir, "https://cbm.example"), "tok-2");
    // Unreadable: enrolls again rather than crash.
    await writeFile(join(dir, "agent-identity.json"), "{not json");
    assert.equal(await loadAgentToken(dir, "https://cbm.example"), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
