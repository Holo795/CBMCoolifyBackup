import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLE_RANK, ROLES, roleRank, isRole, can } from "../src/lib/roles";

test("role ranks are ordered viewer < operator < admin", () => {
  assert.ok(ROLE_RANK.viewer < ROLE_RANK.operator);
  assert.ok(ROLE_RANK.operator < ROLE_RANK.admin);
  assert.deepEqual(ROLES, ["viewer", "operator", "admin"]);
});

test("roleRank: unknown/empty/null roles fall back to viewer (safest)", () => {
  assert.equal(roleRank("nope"), ROLE_RANK.viewer);
  assert.equal(roleRank(""), ROLE_RANK.viewer);
  assert.equal(roleRank(null), ROLE_RANK.viewer);
  assert.equal(roleRank(undefined), ROLE_RANK.viewer);
  assert.equal(roleRank("admin"), ROLE_RANK.admin);
});

test("isRole narrows only known roles", () => {
  assert.equal(isRole("viewer"), true);
  assert.equal(isRole("operator"), true);
  assert.equal(isRole("admin"), true);
  assert.equal(isRole("superuser"), false);
  assert.equal(isRole(""), false);
});

test("can() enforces the hierarchy for every (role, min) pair", () => {
  const expected: Record<string, { operator: boolean; admin: boolean }> = {
    viewer: { operator: false, admin: false },
    operator: { operator: true, admin: false },
    admin: { operator: true, admin: true },
  };
  for (const role of ROLES) {
    assert.equal(can({ role }, "operator"), expected[role].operator, `${role} vs operator`);
    assert.equal(can({ role }, "admin"), expected[role].admin, `${role} vs admin`);
    // Everyone meets the implicit viewer floor.
    assert.equal(can({ role }, "viewer"), true, `${role} vs viewer`);
  }
});

test("can() is false for missing user or unknown role below the bar", () => {
  assert.equal(can(null, "operator"), false);
  assert.equal(can(undefined, "admin"), false);
  assert.equal(can({ role: "ghost" }, "operator"), false);
  assert.equal(can({ role: "ghost" }, "viewer"), true);
});
