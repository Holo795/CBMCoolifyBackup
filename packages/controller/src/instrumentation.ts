// Runs once at server startup (Node runtime). Refuses an insecure production
// configuration, then starts the in-process backup scheduler. There is no admin
// seed: the first person to register becomes the admin and registration then
// closes (see lib/auth.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startupProblems } = await import("@/lib/startup-check");
  const problems = startupProblems({
    nodeEnv: process.env.NODE_ENV,
    authSecret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET,
    masterKey: process.env.MASTER_KEY,
  });
  if (problems.length > 0) {
    for (const p of problems) console.error(`[startup] FATAL: ${p}`);
    process.exit(1);
  }

  try {
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  } catch (e) {
    console.error("[instrumentation] scheduler failed", e);
  }
}
