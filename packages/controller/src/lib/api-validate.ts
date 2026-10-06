import { z } from "zod";
import { NextResponse } from "next/server";

/**
 * Query-string validation for the `/api/v1` surface. Every filter is checked
 * against a closed enum or a bounded number before it reaches Prisma, so a
 * caller can't smuggle arbitrary strings into a `where` clause or request an
 * unbounded page. Invalid input is a typed 400 listing the issues.
 */

export const SNAPSHOT_STATUS = z.enum([
  "queued",
  "pending",
  "running",
  "succeeded",
  "failed",
  "missing",
  "corrupt",
  "skipped",
  "cancelled",
  "deleting",
]);
export const JOB_TYPE = z.enum(["backup", "restore", "prune", "mirror", "verify-destination", "restore-drill"]);
export const JOB_STATUS = z.enum(["queued", "running", "succeeded", "failed", "skipped", "cancelled"]);

const id = z.string().min(1).max(128);
const bool = z.enum(["true", "false"]);

export const resourcesQuery = z.object({
  instanceId: id.optional(),
  serverUuid: id.optional(),
  backupEnabled: bool.optional(),
});

export const snapshotsQuery = z.object({
  resourceId: id.optional(),
  status: SNAPSHOT_STATUS.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const jobsQuery = z.object({
  type: JOB_TYPE.optional(),
  status: JOB_STATUS.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const agentsQuery = z.object({ instanceId: id.optional() });

export const verifyQuery = z.object({ deep: bool.optional() });

/** Validate a request's query string against `schema`. */
export function parseQuery<S extends z.ZodType>(
  schema: S,
  req: Request,
): { ok: true; data: z.infer<S> } | { ok: false; response: NextResponse } {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const r = schema.safeParse(params);
  if (!r.success) {
    const issues = r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return { ok: false, response: NextResponse.json({ error: "invalid query", issues }, { status: 400 }) };
  }
  return { ok: true, data: r.data };
}
