import { env } from "./env";
import { prisma } from "./prisma";
import { decryptSecret } from "./crypto";

/**
 * Single sign-on providers. Each one is configured in Settings (SsoProvider
 * row, secret master-key encrypted) or by environment variables - which win,
 * like the SMTP settings, and show locked in the UI. `oidc` is any OpenID
 * Connect provider found by discovery (Authentik, Keycloak...).
 */
export const SSO_PROVIDERS = ["google", "github", "gitlab", "oidc"] as const;
export type SsoProviderId = (typeof SSO_PROVIDERS)[number];

export type SsoConfig = {
  id: SsoProviderId;
  clientId: string;
  clientSecret: string;
  /** gitlab: self-managed URL; oidc: issuer URL. */
  issuer?: string;
  /** oidc: the sign-in button's label. */
  label?: string;
  source: "env" | "settings";
};

/** A provider as the sign-in pages show it. */
export type SsoButton = { id: SsoProviderId; label?: string };

export const isSsoProvider = (id: string): id is SsoProviderId => (SSO_PROVIDERS as readonly string[]).includes(id);

/** The provider set by environment variables, if any (then it can't be edited in CBM). */
export function ssoFromEnv(id: SsoProviderId): SsoConfig | null {
  const o = env.oauth;
  const pick = (clientId: string, clientSecret: string, extra: Partial<SsoConfig> = {}): SsoConfig | null =>
    clientId && clientSecret ? { id, clientId, clientSecret, source: "env", ...extra } : null;
  switch (id) {
    case "google":
      return pick(o.googleClientId, o.googleClientSecret);
    case "github":
      return pick(o.githubClientId, o.githubClientSecret);
    case "gitlab":
      return pick(o.gitlabClientId, o.gitlabClientSecret, o.gitlabIssuer ? { issuer: o.gitlabIssuer } : {});
    case "oidc":
      return o.oidcIssuer ? pick(o.oidcClientId, o.oidcClientSecret, { issuer: o.oidcIssuer, label: o.oidcLabel || undefined }) : null;
  }
}

/** Every provider that can be used to sign in now, in display order. */
export async function ssoConfigs(): Promise<SsoConfig[]> {
  const rows = await prisma.ssoProvider
    .findMany({ omit: { clientSecretEnc: false } })
    .catch(() => [] as Array<{ id: string; enabled: boolean; clientId: string; clientSecretEnc: string | null; issuer: string | null; label: string | null }>);
  const out: SsoConfig[] = [];
  for (const id of SSO_PROVIDERS) {
    const fromEnv = ssoFromEnv(id);
    if (fromEnv) {
      out.push(fromEnv);
      continue;
    }
    const r = rows.find((x) => x.id === id);
    if (!r?.enabled || !r.clientId || !r.clientSecretEnc) continue;
    if (id === "oidc" && !r.issuer) continue;
    let clientSecret: string;
    try {
      clientSecret = decryptSecret(r.clientSecretEnc);
    } catch {
      continue; // unreadable (master key changed without the recovery file): skip it
    }
    out.push({ id, clientId: r.clientId, clientSecret, issuer: r.issuer || undefined, label: r.label || undefined, source: "settings" });
  }
  return out;
}

/** The buttons of the sign-in and invitation pages. */
export async function ssoButtons(): Promise<SsoButton[]> {
  return (await ssoConfigs()).map((c) => (c.label ? { id: c.id, label: c.label } : { id: c.id }));
}

/** The redirect (callback) URL to register at the provider. */
export function ssoCallbackUrl(id: SsoProviderId): string {
  return `${env.authUrl.replace(/\/+$/, "")}/api/auth/callback/${id}`;
}

/** An OpenID issuer's discovery document URL. */
export function oidcDiscoveryUrl(issuer: string): string {
  const base = issuer.trim().replace(/\/+$/, "");
  return base.endsWith("/.well-known/openid-configuration") ? base : `${base}/.well-known/openid-configuration`;
}

const gitlabBase = (issuer?: string) => (issuer?.trim() || "https://gitlab.com").replace(/\/+$/, "");

/** Token endpoint of a provider (oidc: read from its discovery document). */
async function tokenEndpoint(c: Pick<SsoConfig, "id" | "issuer">, fetchImpl: typeof fetch): Promise<string> {
  switch (c.id) {
    case "google":
      return "https://oauth2.googleapis.com/token";
    case "github":
      return "https://github.com/login/oauth/access_token";
    case "gitlab":
      return `${gitlabBase(c.issuer)}/oauth/token`;
    case "oidc": {
      const r = await fetchImpl(oidcDiscoveryUrl(c.issuer ?? ""), { signal: AbortSignal.timeout(10_000) });
      if (!r.ok) throw new Error(`discovery document answered HTTP ${r.status}`);
      const doc = (await r.json()) as { token_endpoint?: string; authorization_endpoint?: string };
      if (!doc.token_endpoint || !doc.authorization_endpoint) throw new Error("the discovery document has no authorization or token endpoint");
      return doc.token_endpoint;
    }
  }
}

export type SsoCheck = { ok: boolean; code: string; detail?: string };

/**
 * Check a provider's client id and secret without signing anyone in: trade a
 * made-up authorization code. A provider that knows the client answers that
 * the CODE is wrong (invalid_grant / bad_verification_code); one that doesn't
 * answers that the CLIENT is (invalid_client / incorrect_client_credentials).
 */
export async function checkSsoCredentials(
  c: Pick<SsoConfig, "id" | "clientId" | "clientSecret" | "issuer">,
  fetchImpl: typeof fetch = fetch,
): Promise<SsoCheck> {
  let endpoint: string;
  try {
    endpoint = await tokenEndpoint(c, fetchImpl);
  } catch (e) {
    return { ok: false, code: "unreachable", detail: (e as Error).message };
  }
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: "cbm-credentials-check",
    redirect_uri: ssoCallbackUrl(c.id),
    client_id: c.clientId,
    client_secret: c.clientSecret,
  });
  let status: number;
  let text: string;
  try {
    const r = await fetchImpl(endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
    });
    status = r.status;
    text = await r.text();
  } catch (e) {
    return { ok: false, code: "unreachable", detail: (e as Error).message };
  }
  let error = "";
  let description = "";
  try {
    const j = JSON.parse(text) as { error?: string; error_description?: string; access_token?: string };
    // A lax (test) provider that even accepts the made-up code: the client is known.
    if (status === 200 && j.access_token) return { ok: true, code: "accepted" };
    error = j.error ?? "";
    description = j.error_description ?? "";
  } catch {
    error = /error=([a-z_]+)/.exec(text)?.[1] ?? "";
  }
  return ssoCheckVerdict(status, error, description);
}

/** The verdict for a token endpoint's answer to a made-up code (see checkSsoCredentials). */
export function ssoCheckVerdict(status: number, error: string, description = ""): SsoCheck {
  if (/^(invalid_grant|bad_verification_code)$/.test(error)) {
    // The client was accepted; only the (fake) code was refused.
    return { ok: true, code: "accepted" };
  }
  if (/^(invalid_client|incorrect_client_credentials|unauthorized_client)$/.test(error) || status === 401) {
    return { ok: false, code: "client_rejected", detail: description || error || `HTTP ${status}` };
  }
  return { ok: false, code: "unexpected", detail: description || error || `HTTP ${status}` };
}
