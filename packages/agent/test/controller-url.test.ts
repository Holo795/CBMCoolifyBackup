import { test } from "node:test";
import assert from "node:assert/strict";
import { insecureControllerUrl } from "../src/config.js";

test("https is always accepted, plain http only to a private address", () => {
  for (const ok of [
    "https://cbm.example.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://10.0.0.5",
    "http://172.20.1.2:3000",
    "http://192.168.1.10",
    "http://100.101.102.103", // CGNAT / Tailscale
    "http://[::1]:3000",
    "http://[fd12::5]",
    "http://host.docker.internal:3000",
    "http://controller:3000",
    "http://cbm.lan",
  ])
    assert.equal(insecureControllerUrl(ok, false), null, ok);
  for (const bad of ["http://cbm.example.com", "http://203.0.113.4:3000", "http://[2001:db8::1]"])
    assert.match(insecureControllerUrl(bad, false) ?? "", /plain http/, bad);
  assert.equal(insecureControllerUrl("http://cbm.example.com", true), null);
  assert.match(insecureControllerUrl("ftp://x", false) ?? "", /https/);
  assert.match(insecureControllerUrl("not a url", false) ?? "", /not a URL/);
});
