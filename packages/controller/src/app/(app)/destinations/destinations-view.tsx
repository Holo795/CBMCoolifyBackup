import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { PageHeader } from "@/components/page-header";
import { DestinationForm } from "@/components/destination-form";
import { Card, CardContent, CardHeader, CardTitle, Badge, EmptyState } from "@/components/ui";
import { testDestinationAction, deleteDestination, verifyDestinationNow } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { ConfirmDeleteButton } from "@/components/confirm-delete";
import { Gate } from "@/components/role-gate";
import { formatBytes } from "@/lib/cn";
import { HardDrive, Lock, PlugZap, ChevronRight, ShieldCheck, AlertTriangle } from "lucide-react";

type DestinationRow = Prisma.DestinationGetPayload<{
  include: { _count: { select: { snapshots: true; policies: true } } };
}>;

export type DestinationItem = { dest: DestinationRow; bytes: bigint; missing: number };

/** Presentation only: the Destinations list markup. Data is fetched in ./page.tsx. */
export function DestinationsView({ items, globalBytes }: { items: DestinationItem[]; globalBytes: bigint }) {
  return (
    <>
      <PageHeader
        title="Destinations"
        description={`Where backups are stored - local, SSH/SFTP, or S3 · ${formatBytes(globalBytes)} stored across all destinations`}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-3">
          {items.length === 0 ? (
            <EmptyState icon={<HardDrive className="h-6 w-6" />} title="No destinations" hint="Add a place to store your backups." />
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
                          <Lock className="h-3 w-3" /> encrypted
                        </Badge>
                      )}
                      {missing > 0 && (
                        <Badge tone="danger">
                          <AlertTriangle className="h-3 w-3" /> {missing} missing
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{formatBytes(bytes)}</span> · {d._count.snapshots}{" "}
                      snapshots · {d._count.policies} schedule{d._count.policies === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Gate min="operator">
                      <ActionButton
                        action={verifyDestinationNow.bind(null, d.id)}
                        variant="outline"
                        size="sm"
                        successMsg="Checking…"
                        disabled={d._count.snapshots === 0}
                        title={d._count.snapshots === 0 ? "No backups to verify yet" : "Check that every backup is still present"}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" /> Verify
                      </ActionButton>
                    </Gate>
                    <Gate min="admin">
                      <ActionButton action={testDestinationAction.bind(null, d.id)} variant="outline" size="sm" successMsg="Reachable ✓">
                        <PlugZap className="h-3.5 w-3.5" /> Test
                      </ActionButton>
                      <ConfirmDeleteButton
                        action={deleteDestination.bind(null, d.id)}
                        confirmWord={d.name}
                        title={`Delete destination “${d.name}”?`}
                        body={
                          <>
                            This permanently removes the destination{" "}
                            <b>
                              and all {d._count.snapshots} backup{d._count.snapshots === 1 ? "" : "s"}
                            </b>{" "}
                            recorded against it ({formatBytes(bytes)}).{" "}
                            <span className="text-foreground">This cannot be undone.</span>
                          </>
                        }
                      />
                    </Gate>
                    <Link
                      href={`/destinations/${d.id}`}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Open destination"
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
              <CardTitle>Add a destination</CardTitle>
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
