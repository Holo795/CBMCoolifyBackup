import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { PageHeader } from "@/components/page-header";
import { AddDestinationButton } from "@/components/destination-form";
import { Card, Badge, EmptyState, Tooltip } from "@/components/ui";
import { testDestinationAction, deleteDestination, verifyDestinationNow, checkIntegrityNow } from "@/app/actions";
import { ActionsMenu, type MenuAction } from "@/components/actions-menu";
import { IntegrityToggle } from "@/components/integrity-toggle";
import { MirrorPicker } from "@/components/mirror-picker";
import { getT } from "@/lib/i18n";
import { can, requireUser } from "@/lib/session";
import { formatBytes } from "@/lib/cn";
import { Cloud, FolderOpen, Server, HardDrive, Lock, PlugZap, ShieldCheck, AlertTriangle, FileCheck2, Copy, Trash2 } from "lucide-react";
import type { DESTINATION_SECRETS } from "@/lib/public-fields";

type DestinationRow = Prisma.DestinationGetPayload<{
  omit: typeof DESTINATION_SECRETS;
  include: { _count: { select: { snapshots: true; policies: true } } };
}>;

export type DestinationItem = { dest: DestinationRow; bytes: bigint; missing: number };

const TYPE_ICON = { local: FolderOpen, ssh: Server, s3: Cloud } as const;

/** Presentation only: the Destinations list markup. Data is fetched in ./page.tsx. */
export async function DestinationsView({ items, globalBytes }: { items: DestinationItem[]; globalBytes: bigint }) {
  const t = await getT();
  const user = await requireUser();
  const isAdmin = can(user, "admin");
  const isOperator = can(user, "operator");
  const allDests = items.map((i) => ({ id: i.dest.id, name: i.dest.name }));
  const nameById = new Map(allDests.map((d) => [d.id, d.name]));
  const typeLabel: Record<string, string> = {
    local: t("destinations.form.typeLocal"),
    ssh: t("destinations.form.typeSsh"),
    s3: t("destinations.form.typeS3"),
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("destinations.title")}
        description={t("destinations.subtitle", { size: formatBytes(globalBytes) })}
        action={isAdmin ? <AddDestinationButton /> : undefined}
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<HardDrive />}
          title={t("destinations.empty.title")}
          hint={t("destinations.empty.hint")}
          action={isAdmin ? <AddDestinationButton /> : undefined}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map(({ dest: d, bytes, missing }) => {
            const Icon = TYPE_ICON[d.type as keyof typeof TYPE_ICON] ?? HardDrive;
            const empty = d._count.snapshots === 0;
            const menu: MenuAction[] = [
              ...(isOperator
                ? [
                    {
                      label: t("destinations.verify.label"),
                      icon: <ShieldCheck />,
                      action: verifyDestinationNow.bind(null, d.id),
                      successMsg: t("destinations.checking"),
                      disabled: empty,
                    },
                    {
                      label: t("destinations.integrity.label"),
                      icon: <FileCheck2 />,
                      action: checkIntegrityNow.bind(null, d.id),
                      successMsg: t("destinations.checking"),
                      disabled: empty,
                    },
                  ]
                : []),
              ...(isAdmin
                ? ([
                    { label: t("common.test"), icon: <PlugZap />, action: testDestinationAction.bind(null, d.id), successMsg: t("destinations.reachable") },
                    { kind: "separator" },
                    {
                      kind: "delete",
                      label: t("common.delete"),
                      icon: <Trash2 />,
                      action: deleteDestination.bind(null, d.id),
                      confirmWord: d.name,
                      title: t("destinations.delete.title", { name: d.name }),
                      body: (
                        <>
                          {t("destinations.delete.body1")}{" "}
                          <b className="text-foreground">
                            {d._count.snapshots === 1
                              ? t("destinations.delete.bodyBoldOne", { count: d._count.snapshots })
                              : t("destinations.delete.bodyBoldMany", { count: d._count.snapshots })}
                          </b>{" "}
                          {t("destinations.delete.body2", { size: formatBytes(bytes) })} {t("destinations.delete.body3")}
                        </>
                      ),
                    },
                  ] satisfies MenuAction[])
                : []),
            ];
            const integrityFailed =
              d.lastIntegrityStatus != null && d.lastIntegrityStatus !== "ok" && d.lastIntegrityStatus !== "no-agent";
            return (
              <Card key={d.id} className="flex flex-col">
                <div className="flex items-start gap-3 p-5 pb-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-surface text-muted-foreground">
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/destinations/${d.id}`}
                      className="block truncate text-[15px] font-semibold tracking-tight hover:underline focus-visible:outline-none focus-visible:underline"
                    >
                      {d.name}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
                      <span>{typeLabel[d.type] ?? d.type}</span>
                      {d.engine === "restic" && <span>· restic</span>}
                      {(d.encryptionEnabled || d.engine === "restic") && (
                        <span className="inline-flex items-center gap-1">
                          · <Lock className="size-3" /> {t("destinations.badge.encrypted")}
                        </span>
                      )}
                    </p>
                  </div>
                  {menu.length > 0 && <ActionsMenu items={menu} />}
                </div>

                <div className="flex flex-1 flex-wrap items-end justify-between gap-3 px-5 pb-4">
                  <div>
                    <div className="tabular text-2xl font-semibold tracking-tight">{formatBytes(bytes)}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {d._count.snapshots} {t("destinations.word.snapshots")} · {d._count.policies}{" "}
                      {d._count.policies === 1 ? t("destinations.word.schedule") : t("destinations.word.schedules")}
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {missing > 0 && (
                      <Badge tone="danger">
                        <AlertTriangle /> {t("destinations.badge.missing", { count: missing })}
                      </Badge>
                    )}
                    {d.lastIntegrityStatus === "ok" && (
                      <Badge tone="success">
                        <FileCheck2 /> {t("destinations.badge.integrityOk")}
                      </Badge>
                    )}
                    {d.lastIntegrityStatus === "no-agent" && (
                      <Badge tone="warning">
                        <AlertTriangle /> {t("destinations.badge.noAgent")}
                      </Badge>
                    )}
                    {integrityFailed && (
                      <Tooltip content={d.lastIntegrityStatus}>
                        <span tabIndex={0}>
                          <Badge tone="danger">
                            <AlertTriangle /> {t("destinations.badge.integrityFailed")}
                          </Badge>
                        </span>
                      </Tooltip>
                    )}
                    {!isAdmin && d.mirrorToId && nameById.has(d.mirrorToId) && (
                      <Badge tone="accent">
                        <Copy /> {t("destinations.badge.mirrorsTo", { name: nameById.get(d.mirrorToId) ?? "" })}
                      </Badge>
                    )}
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-b-xl border-t bg-surface px-5 py-3">
                    <MirrorPicker id={d.id} current={d.mirrorToId} candidates={allDests.filter((c) => c.id !== d.id)} />
                    <IntegrityToggle id={d.id} enabled={d.integrityCheckEnabled} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
