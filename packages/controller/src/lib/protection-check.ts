import { randomBytes } from "node:crypto";
import type { ResolvedDestination } from "@cbm/shared";
import { redactSecrets } from "@cbm/shared";

/*
 * Is an S3 destination protected from deletion by CBM itself (a compromised
 * CBM, a mistake)? CBM holds the destination's key, so only the storage can
 * enforce it: versioning keeps deleted objects as old versions, and CBM's key
 * must not be allowed to remove a version for good (s3:DeleteObjectVersion).
 * The check proves it on a small witness object rather than reading policies:
 * it writes one, deletes it (a delete marker, allowed), then tries to remove
 * its old version - which must be refused.
 */

export type ProtectionStatus = "protected" | "unprotected" | "error";
export type ProtectionDetail =
  /** `days`: how long deleted versions are kept (lifecycle rule); null = no
   * rule (kept until removed by hand); undefined = couldn't be read. */
  | { code: "ok"; days?: number | null }
  | { code: "versioning-off" | "versioning-suspended" | "can-delete-versions" | "no-version-id" | "not-s3" }
  | { code: "error"; error: string };

export const WITNESS_PREFIX = "cbm-protection-check/";

function isAccessDenied(e: unknown): boolean {
  const err = e as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return err?.name === "AccessDenied" || err?.Code === "AccessDenied" || err?.$metadata?.httpStatusCode === 403;
}

export async function checkS3Protection(dest: ResolvedDestination): Promise<{ status: ProtectionStatus; detail: ProtectionDetail }> {
  if (dest.type !== "s3") return { status: "error", detail: { code: "not-s3" } };
  const s3 = await import("@aws-sdk/client-s3");
  const client = new s3.S3Client({
    region: dest.region,
    endpoint: dest.endpoint || undefined,
    forcePathStyle: dest.forcePathStyle,
    credentials: { accessKeyId: dest.accessKeyId, secretAccessKey: dest.secretAccessKey },
  });
  const Bucket = dest.bucket;
  try {
    const v = await client.send(new s3.GetBucketVersioningCommand({ Bucket }));
    if (v.Status !== "Enabled") {
      return { status: "unprotected", detail: { code: v.Status === "Suspended" ? "versioning-suspended" : "versioning-off" } };
    }
    const prefix = dest.prefix ? `${dest.prefix.replace(/^\/|\/$/g, "")}/` : "";
    const Key = `${prefix}${WITNESS_PREFIX}${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(4).toString("hex")}`;
    const put = await client.send(
      new s3.PutObjectCommand({ Bucket, Key, Body: "CBM deletion-protection check (safe to delete).", ContentType: "text/plain" }),
    );
    if (!put.VersionId) return { status: "error", detail: { code: "no-version-id" } };
    // A plain delete only adds a delete marker on a versioned bucket.
    const marker = await client.send(new s3.DeleteObjectCommand({ Bucket, Key }));
    try {
      await client.send(new s3.DeleteObjectCommand({ Bucket, Key, VersionId: put.VersionId }));
    } catch (e) {
      if (!isAccessDenied(e)) throw e;
      return { status: "protected", detail: { code: "ok", days: await noncurrentDays(client, s3, Bucket, Key) } };
    }
    // The key could delete the version: tidy the witness's marker too.
    if (marker.VersionId) {
      await client.send(new s3.DeleteObjectCommand({ Bucket, Key, VersionId: marker.VersionId })).catch(() => undefined);
    }
    return { status: "unprotected", detail: { code: "can-delete-versions" } };
  } catch (e) {
    return { status: "error", detail: { code: "error", error: redactSecrets((e as Error).message ?? String(e)).slice(0, 300) } };
  } finally {
    client.destroy();
  }
}

/** Days a deleted version is kept for `key` by the bucket's lifecycle rules
 * (the shortest applicable), null when no rule expires them, undefined when
 * the rules can't be read (CBM's key may rightly lack that permission). */
async function noncurrentDays(
  client: import("@aws-sdk/client-s3").S3Client,
  s3: typeof import("@aws-sdk/client-s3"),
  Bucket: string,
  key: string,
): Promise<number | null | undefined> {
  try {
    const lc = await client.send(new s3.GetBucketLifecycleConfigurationCommand({ Bucket }));
    let days: number | null = null;
    for (const r of lc.Rules ?? []) {
      if (r.Status !== "Enabled") continue;
      const prefix = r.Filter?.Prefix ?? r.Filter?.And?.Prefix ?? r.Prefix ?? "";
      if (!key.startsWith(prefix)) continue;
      const d = r.NoncurrentVersionExpiration?.NoncurrentDays;
      if (d != null && (days == null || d < days)) days = d;
    }
    return days;
  } catch (e) {
    const name = (e as { name?: string }).name;
    return name === "NoSuchLifecycleConfiguration" ? null : undefined;
  }
}

/** Parse what's stored in Destination.protectionDetail. */
export function parseProtectionDetail(raw: string | null): ProtectionDetail | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as ProtectionDetail;
    return d && typeof d === "object" && "code" in d ? d : null;
  } catch {
    return null;
  }
}

/**
 * Check one destination now, record the result, and alert when a destination
 * that was protected no longer is (a policy or versioning changed).
 */
export async function runProtectionCheck(destinationId: string): Promise<{ status: ProtectionStatus; detail: ProtectionDetail } | null> {
  const { prisma } = await import("./prisma");
  const { resolveDestination } = await import("./jobs");
  const dest = await prisma.destination.findUnique({ where: { id: destinationId } });
  if (!dest || dest.type !== "s3") return null;
  const res = await checkS3Protection(resolveDestination(dest));
  await prisma.destination.update({
    where: { id: destinationId },
    data: { protectionStatus: res.status, protectionDetail: JSON.stringify(res.detail), protectionCheckedAt: new Date() },
  });
  if (dest.protectionStatus === "protected" && res.status !== "protected") {
    const { notifyProtectionLost } = await import("./notify");
    await notifyProtectionLost(dest.name, describeDetail(res.detail)).catch(() => undefined);
  }
  return res;
}

/** English one-liner for alerts (the UI translates the detail itself). */
export function describeDetail(d: ProtectionDetail): string {
  switch (d.code) {
    case "ok":
      return d.days != null ? `deleted versions kept ${d.days} days` : "deleted versions kept";
    case "versioning-off":
      return "bucket versioning is off";
    case "versioning-suspended":
      return "bucket versioning is suspended";
    case "can-delete-versions":
      return "CBM's key can delete old versions for good (s3:DeleteObjectVersion allowed)";
    case "no-version-id":
      return "the storage returned no version id";
    case "not-s3":
      return "not an S3 destination";
    case "error":
      return d.error;
  }
}

/** Weekly: re-check S3 destinations that are protected, receive mirror copies,
 * or were checked once. */
export async function checkAllProtection(): Promise<void> {
  const { prisma } = await import("./prisma");
  const dests = await prisma.destination.findMany({
    where: { type: "s3", OR: [{ protected: true }, { mirrorFrom: { some: {} } }, { protectionCheckedAt: { not: null } }] },
    select: { id: true, name: true },
  });
  for (const d of dests) {
    await runProtectionCheck(d.id).catch((e) => console.error(`[protection] ${d.name}:`, (e as Error).message));
  }
}
