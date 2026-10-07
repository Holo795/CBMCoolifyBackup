import { spawn } from "node:child_process";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  /** Set when the process was killed for exceeding `timeoutMs`. */
  timedOut?: boolean;
}

/**
 * Spawn a process and buffer stdout/stderr as strings. A non-zero exit is NOT an
 * error here - the caller inspects `code` (many callers expect a failing exit,
 * e.g. `docker inspect` on a missing container). Rejects only if the process
 * fails to spawn. With `timeoutMs`, the process is killed past the limit and
 * resolves with code 124 and `timedOut: true`.
 */
export function runCapture(
  bin: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv; timeoutMs?: number; onStderr?: (chunk: string) => void } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env: opts.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer =
      opts.timeoutMs != null
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
          }, opts.timeoutMs)
        : undefined;
    child.stdout!.on("data", (d) => (stdout += d.toString()));
    child.stderr!.on("data", (d) => {
      const chunk = d.toString();
      stderr += chunk;
      opts.onStderr?.(chunk);
    });
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        resolve({ code: 124, stdout, stderr: `${stderr}\n[timed out after ${Math.round(opts.timeoutMs! / 1000)}s]`, timedOut });
      } else {
        resolve({ code: code ?? -1, stdout, stderr });
      }
    });
  });
}
