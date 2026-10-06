"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  type ButtonSize,
} from "@/components/ui";
import { ConfirmDeleteDialog, type ConfirmDeleteProps } from "@/components/confirm-delete";
import { useT } from "@/components/i18n-provider";

type Result = { ok?: boolean; error?: string; detail?: string } | void | unknown;

type RunAction = {
  kind?: "action";
  label: string;
  icon?: ReactNode;
  action: () => Promise<Result>;
  successMsg?: string;
  disabled?: boolean;
  /** Native confirm() before running. */
  confirm?: string;
};

export type MenuAction =
  | RunAction
  | { kind: "link"; label: string; icon?: ReactNode; href: string; external?: boolean }
  | ({ kind: "delete"; label: string; icon?: ReactNode } & ConfirmDeleteProps)
  | { kind: "separator" };

/** The "…" menu of a row or card: secondary actions, results as toasts. */
export function ActionsMenu({ items, size = "icon-sm", label }: { items: MenuAction[]; size?: ButtonSize; label?: string }) {
  const t = useT();
  const router = useRouter();
  const [, start] = useTransition();
  const [confirm, setConfirm] = useState<(ConfirmDeleteProps & { label: string }) | null>(null);

  const run = (a: RunAction) => {
    if (a.confirm && !window.confirm(a.confirm)) return;
    start(async () => {
      try {
        const r = (await a.action()) as { error?: string; detail?: string } | undefined;
        if (r && r.error) toast.error(r.error);
        else {
          toast.success((r && r.detail) || a.successMsg || t("common.done"));
          router.refresh();
        }
      } catch (e) {
        toast.error((e as Error).message || t("common.error"));
      }
    });
  };

  const visible = items.filter((it, i) => !(it.kind === "separator" && (i === 0 || i === items.length - 1)));
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size={size} aria-label={label ?? t("components.moreActions")}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {visible.map((it, i) => {
            // Items are a static list built per render: a label is a stable key.
            const key = it.kind === "separator" ? `sep-${i}` : `${it.kind ?? "action"}-${it.label}`;
            if (it.kind === "separator") return <DropdownMenuSeparator key={key} />;
            if (it.kind === "link")
              return (
                <DropdownMenuItem key={key} asChild>
                  <a href={it.href} {...(it.external ? { target: "_blank", rel: "noreferrer noopener" } : {})}>
                    {it.icon} {it.label}
                  </a>
                </DropdownMenuItem>
              );
            if (it.kind === "delete")
              return (
                <DropdownMenuItem key={key} tone="danger" onSelect={() => setConfirm(it)}>
                  {it.icon} {it.label}
                </DropdownMenuItem>
              );
            return (
              <DropdownMenuItem key={key} disabled={it.disabled} onSelect={() => run(it)}>
                {it.icon} {it.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {confirm && (
        <ConfirmDeleteDialog
          open
          onOpenChange={(v) => !v && setConfirm(null)}
          action={confirm.action}
          confirmWord={confirm.confirmWord}
          title={confirm.title}
          body={confirm.body}
          redirectTo={confirm.redirectTo}
        />
      )}
    </>
  );
}
