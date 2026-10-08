import type { JobResult } from "@cbm/shared";
import { mkdir, readdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Job results must reach the controller: a result lost during a controller
 * restart left a finished backup marked failed by the reaper hours later (false
 * alert, uploaded files orphaned). A result is retried with backoff, then kept
 * on disk and resent until the controller takes it (the result route is
 * idempotent). A result the controller definitively rejects (job unknown,
 * malformed) is dropped so it can't loop forever; anything older than a week too.
 */
export type SendResult = (result: JobResult) => Promise<void>;

/** HTTP status attached to an error thrown by the sender, if any. */
const statusOf = (e: unknown): number | undefined => (e as { status?: number })?.status;
/** 400 malformed / 404 job not ours or gone: resending can't succeed. */
const isFinal = (e: unknown) => [400, 404].includes(statusOf(e) ?? 0);

const MAX_AGE_MS = 7 * 24 * 3600_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function outboxDir(workDir: string): string {
  return join(workDir, "pending-results");
}

export async function deliverResult(
  workDir: string,
  result: JobResult,
  send: SendResult,
  opts: { attempts?: number; baseDelayMs?: number; log?: (msg: string) => void } = {},
): Promise<"sent" | "dropped" | "queued"> {
  const attempts = opts.attempts ?? 5;
  const base = opts.baseDelayMs ?? 2000;
  for (let i = 0; i < attempts; i++) {
    try {
      await send(result);
      return "sent";
    } catch (e) {
      if (isFinal(e)) {
        opts.log?.(`result for job ${result.jobId} rejected by the controller: ${(e as Error).message}`);
        return "dropped";
      }
      if (i < attempts - 1) await sleep(Math.min(base * 2 ** i, 30_000));
    }
  }
  await keepResult(workDir, result);
  opts.log?.(`controller unreachable: result for job ${result.jobId} kept and will be resent`);
  return "queued";
}

/** Put a result in the outbox: the agent process running next sends it (the
 * agent updater leaves the update's outcome there). */
export async function keepResult(workDir: string, result: JobResult): Promise<void> {
  const dir = outboxDir(workDir);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${result.jobId.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`), JSON.stringify(result), { mode: 0o600 });
}

/** Resend results kept on disk (at startup, then periodically). */
/** Job ids whose result is waiting in the outbox (still "ours" until delivered). */
export async function pendingResultIds(workDir: string): Promise<string[]> {
  const files = await readdir(outboxDir(workDir)).catch(() => [] as string[]);
  return files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -".json".length));
}

export async function flushPendingResults(
  workDir: string,
  send: SendResult,
  log?: (msg: string) => void,
): Promise<{ sent: number; kept: number; dropped: number }> {
  const dir = outboxDir(workDir);
  let files: string[] = [];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    return { sent: 0, kept: 0, dropped: 0 };
  }
  let sent = 0;
  let kept = 0;
  let dropped = 0;
  for (const f of files) {
    const path = join(dir, f);
    try {
      if (Date.now() - (await stat(path)).mtimeMs > MAX_AGE_MS) {
        await rm(path, { force: true });
        dropped++;
        continue;
      }
      const result = JSON.parse(await readFile(path, "utf8")) as JobResult;
      try {
        await send(result);
        await rm(path, { force: true });
        sent++;
        log?.(`delivered the pending result for job ${result.jobId}`);
      } catch (e) {
        if (isFinal(e)) {
          await rm(path, { force: true });
          dropped++;
        } else kept++;
      }
    } catch {
      await rm(path, { force: true }); // unreadable file
      dropped++;
    }
  }
  return { sent, kept, dropped };
}
