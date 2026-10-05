import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { PageHeader } from "@/components/page-header";
import { DestinationForm } from "@/components/destination-form";
import { Card, CardContent, CardHeader, CardTitle, Badge, EmptyState } from "@/components/ui";
import { testDestinationAction, deleteDestination, verifyDestinationNow, checkIntegrityNow } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { IntegrityToggle } from "@/components/integrity-toggle";
import { MirrorPicker } from "@/components/mirror-picker";
import { ConfirmDeleteButton } from "@/components/confirm-delete";
import { Gate } from "@/components/role-gate";
import { getT } from "@/lib/i18n";
import { formatBytes } from "@/lib/cn";
import { HardDrive, Lock, PlugZap, ChevronRight, ShieldCheck, AlertTriangle, FileCheck2, Copy } from "lucide-react";

type DestinationRow = Prisma.DestinationGetPayload<{
  include: { _count: { select: { snapshots: true; policies: true } } };
}>;

export type DestinationItem = { dest: DestinationRow; bytes: bigint; missing: number };

/** Presentation only: the Destinations list markup. Data is fetched in ./page.tsx. */
export async function DestinationsView({ items, globalBytes }: { items: DestinationItem[]; globalBytes: bigint }) {
  const t = await getT();
  const allDests = items.map((i) => ({ id: i.dest.id, name: i.dest.name }));
  const nameById = new Map(allDests.map((d) => [d.id, d.name]));
  return (
    <>
      <PageHeader
        title={t("destinations.title")}
        description={t("destinations.subtitle", { size: formatBytes(globalBytes) })}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-3">
          {items.length === 0 ? (
            <EmptyState icon={<HardDrive className="h-6 w-6" />} title={t("destinations.empty.title")} hint={t("destinations.empty.hint")} />
          ) : (
            items.map(({ dest: d, bytes, missing }) => (
              <Card key={d.id}>
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      <Link href={`/destinations/${d.id}`} className="hover:underline">
                        {d.name}
                      </Link>
                      <Badge tone="accent">{d.type}</Badge>
                      {d.engine === "restic" && <Badge tone="accent">restic</Badge>}
                      {(d.encryptionEnabled || d.engine === "restic") && (
                        <Badge tone="success">
                          <Lock className="h-3 w-3" /> {t("destinations.badge.encrypted")}
                        </Badge>
                      )}
                      {missing > 0 && (
                        <Badge tone="danger">
                          <AlertTriangle className="h-3 w-3" /> {t("destinations.badge.missing", { count: missing })}
                        </Badge>
                      )}
                      {d.lastIntegrityStatus === "ok" && (
                        <Badge tone="success">
                          <FileCheck2 className="h-3 w-3" /> {t("destinations.badge.integrityOk")}
                        </Badge>
                      )}
                      {d.lastIntegrityStatus === "no-agent" && (
                        <Badge tone="warning">
                          <AlertTriangle className="h-3 w-3" /> {t("destinations.badge.noAgent")}
                        </Badge>
                      )}
                      {d.lastIntegrityStatus != null &&
                        d.lastIntegrityStatus !== "ok" &&
                        d.lastIntegrityStatus !== "no-agent" && (
                          <Badge tone="danger">
                            <AlertTriangle className="h-3 w-3" /> {t("destinations.badge.integrityFailed")}
                          </Badge>
                        )}
                      {d.mirrorToId && nameById.has(d.mirrorToId) && (
                        <Badge tone="accent">
                          <Copy className="h-3 w-3" /> {t("destinations.badge.mirrorsTo", { name: nameById.get(d.mirrorToId) ?? "" })}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{formatBytes(bytes)}</span> · {d._count.snapshots}{" "}
                      {t("destinations.word.snapshots")} · {d._count.policies}{" "}
                      {d._count.policies === 1 ? t("destinations.word.schedule") : t("destinations.word.schedules")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Gate min="operator">
                      <ActionButton
                        action={verifyDestinationNow.bind(null, d.id)}
                        variant="outline"
                        size="sm"
                        successMsg={t("destinations.checking")}
                        disabled={d._count.snapshots === 0}
                        title={d._count.snapshots === 0 ? t("destinations.verify.titleEmpty") : t("destinations.verify.title")}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" /> {t("destinations.verify.label")}
                      </ActionButton>
                      <ActionButton
                        action={checkIntegrityNow.bind(null, d.id)}
                        variant="outline"
                        size="sm"
                        successMsg={t("destinations.checking")}
                        disabled={d._count.snapshots === 0}
                        title={d._count.snapshots === 0 ? t("destinations.integrity.titleEmpty") : t("destinations.integrity.title")}
                      >
                        <FileCheck2 className="h-3.5 w-3.5" /> {t("destinations.integrity.label")}
                      </ActionButton>
                    </Gate>
                    <Gate min="admin">
                      <MirrorPicker id={d.id} current={d.mirrorToId} candidates={allDests.filter((c) => c.id !== d.id)} />
                      <IntegrityToggle id={d.id} enabled={d.integrityCheckEnabled} />
                      <ActionButton action={testDestinationAction.bind(null, d.id)} variant="outline" size="sm" successMsg={t("destinations.reachable")}>
                        <PlugZap className="h-3.5 w-3.5" /> {t("common.test")}
                      </ActionButton>
                      <ConfirmDeleteButton
                        action={deleteDestination.bind(null, d.id)}
                        confirmWord={d.name}
                        title={t("destinations.delete.title", { name: d.name })}
                        body={
                          <>
                            {t("destinations.delete.body1")}{" "}
                            <b>
                              {d._count.snapshots === 1
                                ? t("destinations.delete.bodyBoldOne", { count: d._count.snapshots })
                                : t("destinations.delete.bodyBoldMany", { count: d._count.snapshots })}
                            </b>{" "}
                            {t("destinations.delete.body2", { size: formatBytes(bytes) })}{" "}
                            <span className="text-foreground">{t("destinations.delete.body3")}</span>
                          </>
                        }
                      />
                    </Gate>
                    <Link
                      href={`/destinations/${d.id}`}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={t("destinations.open")}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Gate min="admin">
          <Card className="h-fit lg:w-[360px]">
            <CardHeader>
              <CardTitle>{t("destinations.add.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <DestinationForm />
            </CardContent>
          </Card>
        </Gate>
      </div>
    </>
  );
}
