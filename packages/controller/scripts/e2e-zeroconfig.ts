/* Zero-config: per-instance enrollment token (hashed, one-time) -> agent auto-link. */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { encryptSecret, randomToken, sha256Hex } from "@/lib/crypto";
import { syncInstance } from "@/lib/discovery";

const token = readFileSync("/tmp/cbm-test/coolify-token.txt", "utf8").trim();
const baseUrl = "http://localhost:8000";

await prisma.agent.deleteMany({ where: { hostname: "zeroconf-host" } });
await prisma.coolifyInstance.deleteMany({ where: { name: "real-coolify" } });
const inst = await prisma.coolifyInstance.create({
  data: { name: "real-coolify", baseUrl, apiTokenEnc: encryptSecret(token) },
});

// Mint a per-instance enrollment token the way revealInstallCommand() does:
// store only the hash + a masked hint, keep the plaintext locally for the test.
const enroll = "cbm_" + randomToken(24);
await prisma.coolifyInstance.update({
  where: { id: inst.id },
  data: {
    enrollTokenHash: sha256Hex(enroll),
    enrollTokenHint: `${enroll.slice(0, 8)}…${enroll.slice(-4)}`,
    enrollTokenSetAt: new Date(),
  },
});
console.log(`instance created (enroll=${enroll.slice(0, 8)}…)`);
const synced = await syncInstance(inst.id);
console.log(`synced ${synced.synced} resource(s)`);

// Zero-config auto-link: register with the instance token, NO instanceUuid.
const res = await fetch("http://localhost:3000/api/agents/register", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ enrollmentToken: enroll, hostname: "zeroconf-host" }),
});
const body = (await res.json()) as { agentId?: string };
const agent = body.agentId
  ? await prisma.agent.findUnique({ where: { id: body.agentId }, include: { instance: true } })
  : null;
console.log(`register status=${res.status}, linked to: ${agent?.instance?.name ?? "(none)"}`);
console.log(agent?.instance?.name === "real-coolify" ? "ZERO-CONFIG AUTOLINK: PASS" : "ZERO-CONFIG AUTOLINK: FAIL");

// Idempotency: re-registering the same host reuses the same Agent row.
const res2 = await fetch("http://localhost:3000/api/agents/register", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ enrollmentToken: enroll, hostname: "zeroconf-host" }),
});
const body2 = (await res2.json()) as { agentId?: string };
console.log(body2.agentId === body.agentId ? "IDEMPOTENT REGISTER: PASS" : "IDEMPOTENT REGISTER: FAIL");

// A rotated/invalid cbm_ token must be rejected with 401 (triggers reconfigure).
const bad = await fetch("http://localhost:3000/api/agents/register", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ enrollmentToken: "cbm_" + randomToken(24), hostname: "zeroconf-host" }),
});
console.log(`rotated-token register status=${bad.status} (expect 401)`);
console.log(bad.status === 401 ? "ROTATED-TOKEN 401: PASS" : "ROTATED-TOKEN 401: FAIL");
process.exit(0);
