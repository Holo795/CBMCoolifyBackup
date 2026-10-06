"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldOff, Trash2 } from "lucide-react";
import { Select } from "@/components/ui";
import { ActionsMenu } from "@/components/actions-menu";
import { setUserRole, removeUser, resetUserTwoFactor } from "@/app/actions";
import { ROLES } from "@/lib/roles";
import { useT } from "@/components/i18n-provider";

/** Admin-only per-user controls: change role + remove. Guards are also enforced
 *  server-side; here we just hide/disable what isn't allowed. */
export function UserRowActions({
  userId,
  email,
  role,
  isSelf,
  isLastAdmin,
  twoFactorEnabled,
}: {
  userId: string;
  email: string;
  role: string;
  isSelf: boolean;
  isLastAdmin: boolean;
  twoFactorEnabled: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [value, setValue] = useState(role);
  const [pending, start] = useTransition();

  function onRole(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    const prev = value;
    setValue(next);
    start(async () => {
      const r = await setUserRole(userId, next);
      if (r?.error) {
        toast.error(r.error);
        setValue(prev);
      } else {
        toast.success(t("users.roleUpdated"));
        router.refresh();
      }
    });
  }

  const removable = !isSelf && !isLastAdmin;
  const resettable = !isSelf && twoFactorEnabled;
  const items = [
    ...(resettable
      ? [
          {
            kind: "delete" as const,
            label: t("twofactor.reset"),
            icon: <ShieldOff />,
            action: () => resetUserTwoFactor(userId),
            confirmWord: email,
            title: t("twofactor.resetTitle", { email }),
            body: t("twofactor.resetBody"),
            confirmLabel: t("twofactor.reset"),
            doneMsg: t("messages.twoFactorReset"),
          },
        ]
      : []),
    ...(removable
      ? [
          {
            kind: "delete" as const,
            label: t("common.delete"),
            icon: <Trash2 />,
            action: () => removeUser(userId),
            confirmWord: email,
            title: t("users.remove.title", { email }),
            body: (
              <>
                {t("users.remove.bodyBefore")}
                <b className="text-foreground">{email}</b>
                {t("users.remove.bodyAfter")}
              </>
            ),
          },
        ]
      : []),
  ];
  return (
    <div className="flex items-center justify-end gap-1">
      <Select
        value={value}
        onChange={onRole}
        disabled={pending || isLastAdmin}
        className="w-32 [&_select]:h-8 [&_select]:text-[13px]"
        aria-label={t("users.role")}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {t(`users.roles.${r}`)}
          </option>
        ))}
      </Select>
      {items.length > 0 ? <ActionsMenu items={items} /> : <span className="size-7 shrink-0" aria-hidden />}
    </div>
  );
}
