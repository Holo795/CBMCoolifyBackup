import { test } from "node:test";
import assert from "node:assert/strict";
import { coolifyResourceUrl } from "../src/lib/coolify-link";

test("a resource links to its page in Coolify", () => {
  const ids = { projectUuid: "p1", environmentUuid: "e1" };
  assert.equal(
    coolifyResourceUrl("https://coolify.example.com/", { coolifyUuid: "a1", type: "application", ...ids }),
    "https://coolify.example.com/project/p1/environment/e1/application/a1",
  );
  assert.equal(coolifyResourceUrl("https://c.io", { coolifyUuid: "s1", type: "service", ...ids }), "https://c.io/project/p1/environment/e1/service/s1");
  assert.equal(coolifyResourceUrl("https://c.io", { coolifyUuid: "d1", type: "postgresql", ...ids }), "https://c.io/project/p1/environment/e1/database/d1");
  // Not synced yet: the closest page.
  assert.equal(coolifyResourceUrl("https://c.io", { coolifyUuid: "d1", type: "redis", projectUuid: "p1" }), "https://c.io/project/p1");
  assert.equal(coolifyResourceUrl("https://c.io", { coolifyUuid: "d1", type: "redis" }), "https://c.io");
  assert.equal(coolifyResourceUrl("https://c.io", { coolifyUuid: "coolify-self-x", type: "postgresql", ...ids }), "https://c.io");
});
