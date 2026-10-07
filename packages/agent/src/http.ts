import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";

/*
 * HTTP to the controller. The agent polls every few seconds, so every request
 * used to resolve the controller's name again: on a host with a single, flaky
 * resolver that alone failed a few percent of the polls (EAI_AGAIN). Answers
 * are now cached for a minute, and the last good one keeps being used for up
 * to an hour while the resolver fails.
 */

const FRESH_MS = 60_000;
const STALE_MS = 3_600_000;

type Resolve = (hostname: string, cb: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void;
type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** A `lookup` for net/tls connections, caching what `resolve` returns. */
export function cachingLookup(resolve: Resolve, now: () => number = Date.now) {
  const cache = new Map<string, { at: number; addresses: LookupAddress[] }>();
  return (hostname: string, options: LookupOptions, callback: LookupCallback): void => {
    const reply = (addresses: LookupAddress[]) => {
      const family = options.family === 4 || options.family === 6 ? options.family : 0;
      const usable = family ? addresses.filter((a) => a.family === family) : addresses;
      if (usable.length === 0) {
        const err = Object.assign(new Error(`no ${family ? `IPv${family} ` : ""}address for ${hostname}`), { code: "ENOTFOUND" });
        return callback(err, "", 0);
      }
      if (options.all) return callback(null, usable);
      callback(null, usable[0].address, usable[0].family);
    };
    const hit = cache.get(hostname);
    if (hit && now() - hit.at < FRESH_MS) return reply(hit.addresses);
    resolve(hostname, (err, addresses) => {
      if (err || !addresses?.length) {
        // The resolver hiccuped: the last known address is still the best bet.
        if (hit && now() - hit.at < STALE_MS) return reply(hit.addresses);
        return callback(err ?? Object.assign(new Error(`no address for ${hostname}`), { code: "ENOTFOUND" }), "", 0);
      }
      cache.set(hostname, { at: now(), addresses });
      reply(addresses);
    });
  };
}

const systemResolve: Resolve = (hostname, cb) => dnsLookup(hostname, { all: true }, cb);

const dispatcher = new Agent({ connect: { lookup: cachingLookup(systemResolve) } });

/** fetch() with the cached name resolution. */
export function controllerFetch(url: string, init: RequestInit): Promise<Response> {
  return undiciFetch(url, { ...(init as object), dispatcher }) as unknown as Promise<Response>;
}

/**
 * "fetch failed" says nothing: name the real cause (EAI_AGAIN, ECONNREFUSED,
 * a TLS error…) carried by the error's `cause`.
 */
export function describeHttpError(e: unknown): string {
  const err = e as { message?: string; cause?: { code?: string; message?: string; cause?: { code?: string } } };
  const cause = err?.cause;
  const why = cause?.code ?? cause?.cause?.code ?? cause?.message;
  return why && why !== err?.message ? `${err?.message ?? String(e)} (${why})` : (err?.message ?? String(e));
}
