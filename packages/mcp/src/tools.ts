import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CbmClient, CbmError } from "./client.js";

// Mirror the controller's /api/v1 validation so agents pick valid values up
// front instead of getting a 400 back.
const SNAPSHOT_STATUS = z.enum(["queued", "pending", "running", "succeeded", "failed", "missing", "corrupt", "skipped", "cancelled"]);
const JOB_TYPE = z.enum(["backup", "restore", "prune", "mirror", "verify-destination"]);
const JOB_STATUS = z.enum(["queued", "running", "succeeded", "failed", "skipped", "cancelled"]);

/** Pretty-print a successful result as a text block. */
function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/** Wrap a tool handler so CBM/HTTP errors come back as readable tool errors. */
function guard(fn: () => Promise<unknown>) {
  return async () => {
    try {
      return ok(await fn());
    } catch (e) {
      const msg = e instanceof CbmError ? e.message : e instanceof Error ? e.message : String(e);
      return { content: [{ type: "text" as const, text: msg }], isError: true };
    }
  };
}

/**
 * Register every CBM tool on the server. Scope: reads across the fleet plus the
 * non-destructive triggers (backup, verify, mirror). No restore / self-backup /
 * recovery is exposed — those stay in the controller UI. What a given token can
 * actually do is still enforced server-side by its role.
 */
export function registerTools(server: McpServer, client: CbmClient): void {
  // --- reads -------------------------------------------------------------
  server.registerTool(
    "cbm_whoami",
    { title: "Who am I", description: "Check the CBM token and report its name and role (viewer | operator | admin).", inputSchema: {} },
    guard(() => client.whoami()),
  );

  server.registerTool(
    "cbm_list_instances",
    { title: "List Coolify instances", description: "List the connected Coolify instances (id, name, base URL, last sync).", inputSchema: {} },
    guard(() => client.listInstances()),
  );

  server.registerTool(
    "cbm_list_resources",
    {
      title: "List resources",
      description: "List backup-able resources (databases, apps, services) across instances.",
      inputSchema: {
        instanceId: z.string().optional().describe("Only this Coolify instance id"),
        backupEnabled: z.boolean().optional().describe("Only resources with backups enabled (true) or disabled (false)"),
      },
    },
    async ({ instanceId, backupEnabled }) => guard(() => client.listResources({ instanceId, backupEnabled }))(),
  );

  server.registerTool(
    "cbm_get_resource",
    {
      title: "Get resource",
      description: "One resource with its effective backup schedule (resolved override chain).",
      inputSchema: { id: z.string().describe("Resource id") },
    },
    async ({ id }) => guard(() => client.getResource(id))(),
  );

  server.registerTool(
    "cbm_list_snapshots",
    {
      title: "List snapshots",
      description: "List snapshots newest-first, optionally filtered by resource or status.",
      inputSchema: {
        resourceId: z.string().optional().describe("Only snapshots of this resource"),
        status: SNAPSHOT_STATUS.optional().describe("Only snapshots in this state"),
        limit: z.number().int().min(1).max(200).optional().describe("Max rows (default 50)"),
      },
    },
    async ({ resourceId, status, limit }) => guard(() => client.listSnapshots({ resourceId, status, limit }))(),
  );

  server.registerTool(
    "cbm_get_snapshot",
    {
      title: "Get snapshot",
      description: "One snapshot with its artifacts (filename, kind, size, checksum, encrypted).",
      inputSchema: { id: z.string().describe("Snapshot id") },
    },
    async ({ id }) => guard(() => client.getSnapshot(id))(),
  );

  server.registerTool(
    "cbm_list_destinations",
    { title: "List destinations", description: "List backup destinations (local | ssh | s3) with integrity and mirror status.", inputSchema: {} },
    guard(() => client.listDestinations()),
  );

  server.registerTool(
    "cbm_list_agents",
    {
      title: "List agents",
      description: "List backup agents and their liveness / Docker host facts.",
      inputSchema: { instanceId: z.string().optional().describe("Only agents of this instance") },
    },
    async ({ instanceId }) => guard(() => client.listAgents({ instanceId }))(),
  );

  server.registerTool(
    "cbm_list_jobs",
    {
      title: "List jobs",
      description: "Recent agent jobs (backup | restore | prune | mirror | verify-destination) with progress.",
      inputSchema: {
        type: JOB_TYPE.optional().describe("Only jobs of this type"),
        status: JOB_STATUS.optional().describe("Only jobs in this state"),
        limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 25)"),
      },
    },
    async ({ type, status, limit }) => guard(() => client.listJobs({ type, status, limit }))(),
  );

  server.registerTool(
    "cbm_get_job",
    {
      title: "Get job",
      description: "One job with its full event log (progress + messages).",
      inputSchema: { id: z.string().describe("Job id") },
    },
    async ({ id }) => guard(() => client.getJob(id))(),
  );

  // --- triggers (operator+) ---------------------------------------------
  server.registerTool(
    "cbm_backup_resource",
    {
      title: "Back up a resource",
      description: "Trigger a manual backup of a resource. Returns the queued job id. Needs an operator-or-above token.",
      inputSchema: { resourceId: z.string().describe("Resource id to back up") },
    },
    async ({ resourceId }) => guard(() => client.backupResource(resourceId))(),
  );

  server.registerTool(
    "cbm_mirror_snapshot",
    {
      title: "Mirror a snapshot",
      description: "Copy a snapshot to its destination's configured second destination. Needs an operator-or-above token.",
      inputSchema: { snapshotId: z.string().describe("Snapshot id to mirror") },
    },
    async ({ snapshotId }) => guard(() => client.mirrorSnapshot(snapshotId))(),
  );

  server.registerTool(
    "cbm_verify_destination",
    {
      title: "Verify a destination",
      description:
        "Check a destination's snapshots are present, and with deep=true that they are intact (restic re-reads data; tar decrypts artifacts). Needs an operator-or-above token.",
      inputSchema: {
        destinationId: z.string().describe("Destination id to verify"),
        deep: z.boolean().optional().describe("Deep integrity check, not just presence (default false)"),
      },
    },
    async ({ destinationId, deep }) => guard(() => client.verifyDestination(destinationId, deep ?? false))(),
  );
}
