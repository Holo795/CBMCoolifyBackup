"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { OptionCards } from "@/components/ui";
import { useT } from "@/components/i18n-provider";
import { setTwoFactorPolicy } from "@/app/actions";

type Policy = "optional" | "admins" | "everyone";

/** Settings: who must use two-factor sign-in. Saved as soon as it's picked. */
export function TwoFactorPolicyForm({ policy, total, without }: { policy: Policy; total: number; without: number }) {
  const t = useT();
  const router = useRouter();
  const [value, setValue] = useState<Policy>(policy);
  const [pending, start] = useTransition();

  const onChange = (next: Policy) => {
    if (pending || next === value) return;
    const prev = value;
    setValue(next);
    start(async () => {
      const r = await setTwoFactorPolicy(next);
      if (r?.error) {
        setValue(prev);
        toast.error(r.error);
        return;
      }
      toast.success(t("twofactor.policySaved"));
      // Requiring it may apply to this very account: the next page asks for setup.
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <OptionCards
        name="two-factor-policy"
        label={t("twofactor.policyTitle")}
        value={value}
        onChange={onChange}
        columns={3}
        options={[
          { value: "optional", title: t("twofactor.policyOptional"), hint: t("twofactor.policyOptionalHint") },
          { value: "admins", title: t("twofactor.policyAdmins"), hint: t("twofactor.policyAdminsHint") },
          { value: "everyone", title: t("twofactor.policyEveryone"), hint: t("twofactor.policyEveryoneHint") },
        ]}
      />
      {without > 0 && <p className="text-[13px] text-muted-foreground">{t("twofactor.usersWithout", { count: without, total })}</p>}
    </div>
  );
}
