import { test } from "node:test";
import assert from "node:assert/strict";
import { isTwoFactorPolicy, twoFactorRequired } from "../src/lib/two-factor-policy";

test("the two-factor policy decides who must use it", () => {
  for (const role of ["admin", "operator", "viewer"]) assert.equal(twoFactorRequired("optional", role), false, role);
  assert.equal(twoFactorRequired("admins", "admin"), true);
  assert.equal(twoFactorRequired("admins", "operator"), false);
  assert.equal(twoFactorRequired("admins", null), false);
  for (const role of ["admin", "operator", "viewer"]) assert.equal(twoFactorRequired("everyone", role), true, role);
  assert.equal(twoFactorRequired("unknown", "admin"), false, "an unknown value never locks anyone out");
});

test("only the three known policies are accepted", () => {
  assert.ok(isTwoFactorPolicy("optional") && isTwoFactorPolicy("admins") && isTwoFactorPolicy("everyone"));
  assert.ok(!isTwoFactorPolicy("required") && !isTwoFactorPolicy(""));
});
