import { BlockList, isIPv4, isIPv6 } from "node:net";

/**
 * Minimal fixed-window rate limiter kept in process memory. Enough to blunt
 * brute-force / token-guessing against the programmatic API and the sign-in
 * endpoint on a self-hosted install. Note: state is per controller instance, so
 * behind multiple replicas the effective limit is per-replica — fine for the
 * single-instance default; a shared store would be needed for a cluster.
 */
export type RateLimitResult = { ok: boolean; remaining: number; retryAfterMs: number };

export function createRateLimiter(opts: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  function check(key: string, now = Date.now()): RateLimitResult {
    const e = hits.get(key);
    if (!e || now >= e.resetAt) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      return { ok: true, remaining: opts.max - 1, retryAfterMs: 0 };
    }
    if (e.count >= opts.max) return { ok: false, remaining: 0, retryAfterMs: e.resetAt - now };
    e.count++;
    return { ok: true, remaining: opts.max - e.count, retryAfterMs: 0 };
  }

  /** Drop expired buckets so the map doesn't grow without bound. */
  function sweep(now = Date.now()): void {
    for (const [k, e] of hits) if (now >= e.resetAt) hits.delete(k);
  }

  return { check, sweep };
}

/**
 * The client's IP behind the reverse proxy (Next route handlers don't expose
 * the socket). X-Forwarded-For is read right to left: each proxy appends the
 * address it got the request from, so the rightmost entries are the trusted
 * proxies' (TRUSTED_PROXIES) and the first other one is the client. The
 * leftmost entry is whatever the client sent - taking it let anyone pick a
 * new address on each request and slip past the limits. CLIENT_IP_HEADER names
 * a single header the proxy sets instead (x-real-ip, cf-connecting-ip...).
 */
export function clientIp(
  req: Request,
  opts: { trusted?: (ip: string) => boolean; header?: string } = { trusted: trustedProxy, header: clientIpHeader() },
): string {
  if (opts.header) return req.headers.get(opts.header)?.split(",")[0]?.trim() || "unknown";
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((h) => h.trim()).filter(Boolean);
    const trusted = opts.trusted ?? (() => false);
    for (let i = hops.length - 1; i >= 0; i--) if (!trusted(hops[i]!)) return hops[i]!;
    if (hops[0]) return hops[0];
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** TRUSTED_PROXIES: comma-separated addresses or CIDR ranges of the proxies in front. */
export function trustedProxyList(raw = process.env.TRUSTED_PROXIES ?? ""): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Whether `ip` is one of `list` (addresses or CIDR ranges, IPv4 or IPv6). */
export function makeTrustedMatcher(list: string[]): (ip: string) => boolean {
  const block = new BlockList();
  for (const entry of list) {
    const [addr, bits] = entry.split("/");
    const type = isIPv6(addr!) ? "ipv6" : isIPv4(addr!) ? "ipv4" : null;
    if (!type) continue;
    if (bits !== undefined) block.addSubnet(addr!, Number(bits), type);
    else block.addAddress(addr!, type);
  }
  return (ip: string) => {
    const bare = ip.replace(/^::ffff:/, "");
    if (isIPv4(bare)) return block.check(bare, "ipv4");
    if (isIPv6(ip)) return block.check(ip, "ipv6");
    return false;
  };
}

let matcher: ((ip: string) => boolean) | null = null;
function trustedProxy(ip: string): boolean {
  matcher ??= makeTrustedMatcher(trustedProxyList());
  return matcher(ip);
}

function clientIpHeader(): string | undefined {
  return (process.env.CLIENT_IP_HEADER ?? "").trim().toLowerCase() || undefined;
}
