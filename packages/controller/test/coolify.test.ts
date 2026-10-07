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

test("public repositories: bare owner/repo means GitHub, full URLs and SSH forms pass through", async () => {
  const { publicRepoUrl } = await import("../src/lib/coolify");
  assert.equal(publicRepoUrl("coollabsio/coolify-examples"), "https://github.com/coollabsio/coolify-examples");
  assert.equal(publicRepoUrl("https://git.example.com/a/b.git"), "https://git.example.com/a/b.git");
  assert.equal(publicRepoUrl("git@github.com:a/b.git"), "git@github.com:a/b.git");
});

test("the control plane's server: flagged by Coolify, else the host.docker.internal one", async () => {
  const { coolifyHostServer } = await import("../src/lib/control-plane");
  const a = { uuid: "a", name: "remote", ip: "10.0.0.2" };
  assert.equal(coolifyHostServer([a, { uuid: "b", name: "main", isCoolifyHost: true }])?.uuid, "b");
  assert.equal(coolifyHostServer([a, { uuid: "c", name: "localhost", ip: "host.docker.internal" }])?.uuid, "c");
  assert.equal(coolifyHostServer([a]), undefined);
});

test("a clone names a destination only when its server has several: the source's, same network, coolify, first", async () => {
  const { chooseDestination } = await import("../src/lib/coolify");
  const dests = [
    { uuid: "d1", name: "lan", network: "lan" },
    { uuid: "d2", name: "coolify", network: "coolify" },
    { uuid: "d3", name: "apps", network: "apps" },
  ];
  assert.equal(chooseDestination([dests[0]], { uuid: "zz" }), undefined);
  assert.equal(chooseDestination([]), undefined);
  assert.equal(chooseDestination(dests, { uuid: "d3", network: "lan" }), "d3");
  assert.equal(chooseDestination(dests, { uuid: "other-server", network: "lan" }), "d1");
  assert.equal(chooseDestination(dests, { network: "missing" }), "d2");
  assert.equal(chooseDestination(dests), "d2");
  assert.equal(chooseDestination([dests[0], dests[2]]), "d1");
});

test("the snapshot keeps the source's destination as a hint, when Coolify returns one", async () => {
  const { destinationHint } = await import("../src/lib/jobs");
  assert.deepEqual(destinationHint({ destination: { id: 0, uuid: "d1", network: "coolify", server: { uuid: "s" } } }), {
    destination: { uuid: "d1", network: "coolify" },
  });
  // Services only carry a numeric destination_id.
  assert.deepEqual(destinationHint({ destination_id: 0 }), {});
});
