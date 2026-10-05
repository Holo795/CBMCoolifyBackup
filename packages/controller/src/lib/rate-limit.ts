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

/** Best-effort client IP from proxy headers (Next route handlers don't expose it). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
