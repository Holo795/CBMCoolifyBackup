import { prisma } from "./prisma";
import { decryptSecret } from "./crypto";
import { CoolifyClient, type CoolifyServer } from "./coolify";

/** The server Coolify runs on: flagged by the API, else the one it reaches as
 * host.docker.internal (how Coolify registers its own host). */
export function coolifyHostServer(servers: CoolifyServer[]): CoolifyServer | undefined {
  return servers.find((s) => s.isCoolifyHost) ?? servers.find((s) => s.ip === "host.docker.internal");
}

/**
 * The pseudo-resource for an instance's control plane (Coolify's own database
 * and /data/coolify), pinned to the server Coolify runs on so the backup goes
 * to that host's agent - on a multi-server instance any other agent can't see
 * Coolify's containers.
 */
export async function ensureControlPlaneResource(instanceId: string) {
  const inst = await prisma.coolifyInstance.findUniqueOrThrow({ where: { id: instanceId } });
  const client = new CoolifyClient(inst.baseUrl, decryptSecret(inst.apiTokenEnc));
  const host = coolifyHostServer(await client.listServers().catch(() => []));
  const server = host ? { serverUuid: host.uuid, serverName: host.name } : {};
  return prisma.resource.upsert({
    where: { instanceId_coolifyUuid: { instanceId, coolifyUuid: `coolify-self-${instanceId}` } },
    create: {
      instanceId,
      coolifyUuid: `coolify-self-${instanceId}`,
      name: `${inst.name} (control plane)`,
      type: "postgresql",
      projectName: "Coolify",
      status: "running:healthy",
      backupEnabled: true,
      ...server,
    },
    update: server,
  });
}
