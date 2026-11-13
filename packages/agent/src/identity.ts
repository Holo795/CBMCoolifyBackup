import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The agent's own credential, kept in its work dir (a volume that survives a
 * restart, a reinstall and an update). With it the agent never needs its
 * install token again: that token can be used once, and rotating it no longer
 * breaks the agents already installed. Bound to the controller it was issued
 * by - an agent pointed at another controller enrolls again.
 */
const FILE = "agent-identity.json";

type Stored = { controllerUrl: string; agentToken: string };

export async function loadAgentToken(workDir: string, controllerUrl: string): Promise<string | null> {
  try {
    const s = JSON.parse(await readFile(join(workDir, FILE), "utf8")) as Partial<Stored>;
    if (s.controllerUrl === controllerUrl && typeof s.agentToken === "string" && s.agentToken) return s.agentToken;
  } catch {
    /* none yet, or unreadable: enroll */
  }
  return null;
}

export async function saveAgentToken(workDir: string, controllerUrl: string, agentToken: string): Promise<void> {
  await mkdir(workDir, { recursive: true });
  const path = join(workDir, FILE);
  const tmp = `${path}.tmp`;
  const body: Stored = { controllerUrl, agentToken };
  await writeFile(tmp, JSON.stringify(body), { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, path);
}
