import { test } from "node:test";
import assert from "node:assert/strict";
import { GENERATED_SECRET } from "../src/lib/coolify";

test("GENERATED_SECRET keeps a service's generated credentials, not its domains", () => {
  for (const k of ["SERVICE_USER_WORDPRESS", "SERVICE_PASSWORD_ROOT", "SERVICE_PASSWORD_64_APP", "SERVICE_BASE64_64_KEY", "SERVICE_REALBASE64_X"])
    assert.equal(GENERATED_SECRET.test(k), true, k);
  for (const k of ["SERVICE_FQDN_WORDPRESS", "SERVICE_URL_WORDPRESS", "MYSQL_PASSWORD", "SERVICE_NAME"])
    assert.equal(GENERATED_SECRET.test(k), false, k);
});

test("a cloned application's volumes are created without the original's uuid and matched by mount", async () => {
  const { cloneVolumes, matchVolumes } = await import("../src/lib/jobs");
  const original = [
    { name: "s51ojoq-site", mountPath: "/usr/share/nginx/html" },
    { name: "uploads", mountPath: "/data" },
  ];
  assert.deepEqual(cloneVolumes(original, "s51ojoq"), [
    { name: "site", mountPath: "/usr/share/nginx/html" },
    { name: "uploads", mountPath: "/data" },
  ]);
  const created = [
    { name: "nd8sedi-site", mountPath: "/usr/share/nginx/html" },
    { name: "nd8sedi-uploads", mountPath: "/data" },
  ];
  assert.deepEqual(matchVolumes(original, created), { "s51ojoq-site": "nd8sedi-site", uploads: "nd8sedi-uploads" });
});
