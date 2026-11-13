// Runs once at server startup (Node runtime). Refuses an insecure production
// configuration, then starts the in-process backup scheduler. There is no admin
// seed: the first account needs the setup token (see lib/setup-token.ts) and
// registration then closes (see lib/auth.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startupProblems } = await import("@/lib/startup-check");
  const { isFreshInstall } = await import("@/lib/fresh-install");
  const problems = startupProblems(
    {
      nodeEnv: process.env.NODE_ENV,
      authSecret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET,
      masterKey: process.env.MASTER_KEY,
    },
    await isFreshInstall(),
  );
  if (problems.length > 0) {
    for (const p of problems) console.error(`[startup] FATAL: ${p}`);
    process.exit(1);
  }

  try {
    const { ensureSetupToken } = await import("@/lib/setup-token");
    await ensureSetupToken(process.env.BETTER_AUTH_URL || process.env.APP_URL || "http://localhost:3000");
  } catch (e) {
    console.error("[instrumentation] setup token failed", e);
  }

  try {
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  } catch (e) {
    console.error("[instrumentation] scheduler failed", e);
  }
}
