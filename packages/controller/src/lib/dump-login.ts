/** Engines whose logical dump uses a login (the dump login card applies to them). */
const LOGIN_ENGINES = new Set(["postgresql", "mysql", "mariadb", "mongodb"]);

/**
 * Whether a resource's Options show the database dump login: it is a database,
 * one of its containers runs one (as its agent reports), its last snapshot holds
 * a dump (agents that don't report engines yet), or a login is already set (so
 * it can still be changed or removed). Otherwise it would only be noise.
 */
export function showsDumpLogin(r: {
  type: string;
  containers: unknown;
  dumpUser: string | null;
  lastSnapshotHasDump: boolean;
}): boolean {
  if (r.dumpUser || r.lastSnapshotHasDump || LOGIN_ENGINES.has(r.type)) return true;
  return Array.isArray(r.containers) && r.containers.some((c) => LOGIN_ENGINES.has((c as { engine?: string })?.engine ?? ""));
}
