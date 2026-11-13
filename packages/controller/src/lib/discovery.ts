import { prisma } from "./prisma";
import { decryptSecret } from "./crypto";
import { CoolifyClient } from "./coolify";

/** Complete discoveries in a row a resource must be missing from before it is
 * taken as removed from Coolify (one runs every few minutes). */
export const MISSING_SYNCS_BEFORE_REMOVED = 3;

/** Sync all resources for a Coolify instance into the local DB. Throws when
 * Coolify's listing fails: nothing is marked removed on a partial listing. */
export async function syncInstance(instanceId: string): Promise<{ synced: number }> {
  const instance = await prisma.coolifyInstance.findUniqueOrThrow({ where: { id: instanceId } });
  const token = decryptSecret(instance.apiTokenEnc);
  const client = new CoolifyClient(instance.baseUrl, token);
  const resources = await client.listResources();

  let synced = 0;
  for (const r of resources) {
    if (!r.uuid) continue;
    await prisma.resource.upsert({
      where: { instanceId_coolifyUuid: { instanceId, coolifyUuid: r.uuid } },
      create: {
        instanceId,
        coolifyUuid: r.uuid,
        name: r.name,
        type: r.type,
        projectName: r.projectName,
        environment: r.environment,
        projectUuid: r.projectUuid,
        environmentUuid: r.environmentUuid,
        buildPack: r.buildPack,
        status: r.status,
        serverUuid: r.serverUuid,
        serverName: r.serverName,
      },
      update: {
        name: r.name,
        type: r.type,
        // Keep the last known names and ids when they didn't come back (an
        // environment Coolify didn't detail, an older Coolify).
        ...(r.projectName ? { projectName: r.projectName } : {}),
        ...(r.environment ? { environment: r.environment } : {}),
        // Keep the last known ids when an older Coolify doesn't return them.
        ...(r.projectUuid ? { projectUuid: r.projectUuid } : {}),
        ...(r.environmentUuid ? { environmentUuid: r.environmentUuid } : {}),
        buildPack: r.buildPack,
        status: r.status,
        serverUuid: r.serverUuid,
        serverName: r.serverName,
        missingSyncs: 0,
      },
    });
    synced++;
  }

  // Resources that no longer exist in Coolify (e.g. a "→ new" clone that was
  // deleted). The listing above either is complete or throws, and a resource
  // still has to be missing from several of them in a row before it counts as
  // removed. Those with no snapshots are deleted, so backup history of a
  // genuinely removed resource isn't lost; the others are marked "deleted",
  // which takes them out of scheduled backups while keeping their settings: a
  // resource that comes back is backed up as before. coolify-self is synthetic.
  const seen = resources.map((r) => r.uuid).filter((u): u is string => !!u);
  if (seen.length > 0) {
    const unseen = { instanceId, coolifyUuid: { notIn: seen }, NOT: { coolifyUuid: { startsWith: "coolify-self" } } };
    await prisma.resource.updateMany({ where: unseen, data: { missingSyncs: { increment: 1 } } });
    const stale = await prisma.resource.findMany({
      where: { ...unseen, missingSyncs: { gte: MISSING_SYNCS_BEFORE_REMOVED } },
      select: { id: true, status: true, _count: { select: { snapshots: true } } },
    });
    const toDelete = stale.filter((r) => r._count.snapshots === 0).map((r) => r.id);
    const toOrphan = stale.filter((r) => r._count.snapshots > 0 && r.status !== "deleted").map((r) => r.id);
    if (toDelete.length) await prisma.resource.deleteMany({ where: { id: { in: toDelete } } });
    if (toOrphan.length) {
      await prisma.resource.updateMany({ where: { id: { in: toOrphan } }, data: { status: "deleted" } });
    }
  }

  await prisma.coolifyInstance.update({
    where: { id: instanceId },
    data: { lastSyncedAt: new Date() },
  });
  return { synced };
}
