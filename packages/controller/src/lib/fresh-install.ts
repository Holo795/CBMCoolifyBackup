import { prisma } from "./prisma";

/** Nothing stored yet: no account, no Coolify instance, no destination. An
 * unreachable database counts as not fresh (never blocks a working install). */
export async function isFreshInstall(): Promise<boolean> {
  try {
    const [users, instances, destinations] = await Promise.all([
      prisma.user.count(),
      prisma.coolifyInstance.count(),
      prisma.destination.count(),
    ]);
    return users + instances + destinations === 0;
  } catch {
    return false;
  }
}
