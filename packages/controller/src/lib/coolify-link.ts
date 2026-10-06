/**
 * A resource's page in Coolify's own UI:
 * /project/{project}/environment/{environment}/{application|database|service}/{uuid}.
 * Until a sync has recorded the project and environment ids, the project (or
 * the dashboard) is the closest page.
 */
export function coolifyResourceUrl(
  baseUrl: string,
  r: { coolifyUuid: string; type: string; projectUuid?: string | null; environmentUuid?: string | null },
): string {
  const base = baseUrl.replace(/\/+$/, "");
  // Coolify's own control plane: its dashboard.
  if (r.coolifyUuid.startsWith("coolify-self")) return base;
  if (!r.projectUuid) return base;
  if (!r.environmentUuid) return `${base}/project/${r.projectUuid}`;
  const kind = r.type === "application" ? "application" : r.type === "service" ? "service" : "database";
  return `${base}/project/${r.projectUuid}/environment/${r.environmentUuid}/${kind}/${r.coolifyUuid}`;
}
