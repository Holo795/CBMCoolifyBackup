/*
 * When to say the controller is unreachable. A single failed poll (after its
 * quick retries) is noise; a few in a row are worth a warning, then a reminder
 * now and then, and a word when it's back.
 */

/** Failed polls in a row before a warning. */
export const WARN_AFTER = 3;
/** Then a reminder every this many failed polls. */
export const REMIND_EVERY = 60;

export type PollLog = { level: "debug" | "info" | "warn"; message: string };

export class PollHealth {
  private failures = 0;

  /** A poll failed after its retries: what to log. */
  failed(cause: string): PollLog {
    this.failures++;
    const n = this.failures;
    if (n === WARN_AFTER) return { level: "warn", message: `Controller unreachable (${n} polls in a row): ${cause}` };
    if (n > WARN_AFTER && (n - WARN_AFTER) % REMIND_EVERY === 0) {
      return { level: "warn", message: `Controller still unreachable (${n} polls in a row): ${cause}` };
    }
    return { level: "debug", message: `poll failed (${n} in a row): ${cause}` };
  }

  /** A poll went through: anything to say? */
  succeeded(): PollLog | null {
    const n = this.failures;
    this.failures = 0;
    return n >= WARN_AFTER ? { level: "info", message: `Controller reachable again after ${n} failed polls` } : null;
  }
}

/** Try `fn`, then retry after each delay; the last error is thrown. */
export async function withQuickRetries<T>(fn: () => Promise<T>, delaysMs: number[], sleep: (ms: number) => Promise<unknown>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= delaysMs.length || /\b40[13]\b/.test((e as Error).message)) throw e;
      await sleep(delaysMs[i]);
    }
  }
}
