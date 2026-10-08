import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSsoCredentials, oidcDiscoveryUrl, ssoCheckVerdict } from "../src/lib/sso";
import { ssoErrorText } from "../src/lib/auth-errors";

test("a made-up code tells a known client from an unknown one", () => {
  assert.equal(ssoCheckVerdict(400, "invalid_grant").ok, true); // Google, GitLab, Authentik
  assert.equal(ssoCheckVerdict(200, "bad_verification_code").ok, true); // GitHub
  assert.deepEqual(ssoCheckVerdict(401, "invalid_client", "The OAuth client was not found."), {
    ok: false,
    code: "client_rejected",
    detail: "The OAuth client was not found.",
  });
  assert.equal(ssoCheckVerdict(200, "incorrect_client_credentials").code, "client_rejected");
  assert.equal(ssoCheckVerdict(500, "").code, "unexpected");
  assert.equal(ssoCheckVerdict(400, "invalid_request").code, "unexpected");
});

test("an OIDC issuer's discovery document URL", () => {
  assert.equal(oidcDiscoveryUrl("https://auth.example.com/application/o/cbm/"), "https://auth.example.com/application/o/cbm/.well-known/openid-configuration");
  assert.equal(
    oidcDiscoveryUrl("https://kc.example.com/realms/x/.well-known/openid-configuration"),
    "https://kc.example.com/realms/x/.well-known/openid-configuration",
  );
});

test("the check reads the OIDC token endpoint from discovery, and sends the client", async () => {
  const calls: Array<{ url: string; body?: string }> = [];
  const fake = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? String(init.body) : undefined });
    if (String(url).endsWith("/.well-known/openid-configuration"))
      return new Response(JSON.stringify({ authorization_endpoint: "https://idp/auth", token_endpoint: "https://idp/token" }));
    return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
  }) as typeof fetch;
  const r = await checkSsoCredentials({ id: "oidc", clientId: "cbm", clientSecret: "s", issuer: "https://idp/app/" }, fake);
  assert.equal(r.ok, true);
  assert.equal(calls[1].url, "https://idp/token");
  assert.match(calls[1].body!, /client_id=cbm/);
  assert.match(calls[1].body!, /redirect_uri=.*%2Fapi%2Fauth%2Fcallback%2Foidc/);
  const down = (async () => {
    throw new Error("getaddrinfo ENOTFOUND idp");
  }) as typeof fetch;
  assert.equal((await checkSsoCredentials({ id: "gitlab", clientId: "a", clientSecret: "b" }, down)).code, "unreachable");
});

test("a failed single sign-on is explained on the sign-in page", () => {
  const t = (k: string, v?: Record<string, string | number>) => `${k}${v ? JSON.stringify(v) : ""}`;
  assert.equal(ssoErrorText(undefined, t), null);
  assert.equal(ssoErrorText("account_not_linked", t), "auth.ssoErrors.account_not_linked");
  assert.equal(ssoErrorText("REGISTRATION_CLOSED", t), "auth.ssoErrors.REGISTRATION_CLOSED");
  assert.equal(ssoErrorText("weird_code", t), 'auth.ssoErrors.other{"code":"weird_code"}');
});
