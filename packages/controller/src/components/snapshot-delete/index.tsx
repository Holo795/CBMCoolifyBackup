import type { ReactNode } from "react";
import { CopyX, Trash2 } from "lucide-react";
import type { MenuAction } from "@/components/actions-menu";
import { deleteSnapshot } from "@/app/actions";
import type { T } from "@/lib/i18n-shared";

/**
 * The delete entries of a snapshot's "…" menu. Its mirror copies are kept
 * unless the second entry is chosen; a snapshot on a protected destination
 * can't be deleted at all.
 */
export function snapshotDeleteItems(
  t: T,
  s: { id: string; mirrors: number; protectedDest: boolean },
  confirm: { title: string; body: ReactNode; confirmWord: string; redirectTo?: string },
): MenuAction[] {
  if (s.protectedDest) {
    return [{ label: t("snapshots.deleteProtected"), icon: <Trash2 />, action: deleteSnapshot.bind(null, s.id, false), disabled: true }];
  }
  const items: MenuAction[] = [
    {
      kind: "delete",
      label: t("common.delete"),
      icon: <Trash2 />,
      action: deleteSnapshot.bind(null, s.id, false),
      ...confirm,
      body: (
        <>
          {confirm.body}
          {s.mirrors > 0 && <span className="mt-2 block">{t(s.mirrors === 1 ? "snapshots.mirrorsKeptOne" : "snapshots.mirrorsKeptMany", { count: s.mirrors })}</span>}
        </>
      ),
    },
  ];
  if (s.mirrors > 0) {
    items.push({
      kind: "delete",
      label: t("snapshots.deleteWithMirrors"),
      icon: <CopyX />,
      action: deleteSnapshot.bind(null, s.id, true),
      ...confirm,
      title: t("snapshots.deleteWithMirrorsTitle"),
      body: (
        <>
          {confirm.body}
          <span className="mt-2 block">
            <b className="text-foreground">{t(s.mirrors === 1 ? "snapshots.deleteWithMirrorsBodyOne" : "snapshots.deleteWithMirrorsBodyMany", { count: s.mirrors })}</b>
          </span>
        </>
      ),
    });
  }
  return items;
}
