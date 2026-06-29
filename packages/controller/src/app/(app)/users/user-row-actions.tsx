"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";
import { ConfirmDeleteButton } from "@/components/confirm-delete";
import { setUserRole, removeUser } from "@/app/actions";
import { ROLES } from "@/lib/roles";

/** Admin-only per-user controls: change role + remove. Guards are also enforced
 *  server-side; here we just hide/disable what isn't allowed. */
export function UserRowActions({
  userId,
  email,
  role,
  isSelf,
  isLastAdmin,
}: {
  userId: string;
  email: string;
  role: string;
  isSelf: boolean;
  isLastAdmin: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(role);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onRole(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    const prev = value;
    setValue(next);
    setErr(null);
    start(async () => {
      const r = await setUserRole(userId, next);
      if (r?.error) {
        setErr(r.error);
        setValue(prev);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {err && <span className="text-xs text-[var(--color-danger)]">{err}</span>}
      <Select value={value} onChange={onRole} disabled={pending || isLastAdmin} className="w-28" aria-label="Role">
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </Select>
      {!isSelf && !isLastAdmin && (
        <ConfirmDeleteButton
          action={() => removeUser(userId)}
          confirmWord={email}
          title={`Remove ${email}?`}
          body={
            <>This permanently removes <b>{email}</b> and signs out their sessions. They&apos;d need a new invitation to return.</>
          }
        />
      )}
    </div>
  );
}
