"use client";

import { useId, useState } from "react";
import { Copy, ShieldCheck, Trash2 } from "lucide-react";
import { Field, Input, OptionCards, SwitchRow } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

/**
 * A destination's deletion protection: "protected" (CBM never deletes there)
 * and how the mirror copies it receives are kept. Posted with the panel's form
 * (see setDestinationProtection).
 */
export function DestinationProtectionFields({
  isProtected,
  mirrorRetention,
  keep,
  receivesMirrors,
  isS3,
}: {
  isProtected: boolean;
  mirrorRetention: string;
  keep: { daily: number; weekly: number; monthly: number };
  receivesMirrors: boolean;
  isS3: boolean;
}) {
  const t = useT();
  const id = useId();
  const [retention, setRetention] = useState<"source" | "own">(mirrorRetention === "own" ? "own" : "source");

  return (
    <div className="flex flex-col gap-6">
      <SwitchRow
        id={`${id}-protected`}
        name="protected"
        defaultChecked={isProtected}
        label={t("destinations.protection.protected")}
        description={
          <>
            {t("destinations.protection.protectedHint")}{" "}
            {isS3 ? t("destinations.protection.protectedHintS3") : t("destinations.protection.protectedHintOther")}
          </>
        }
      />

      <Field
        label={t("destinations.protection.mirrorRetention")}
        hint={receivesMirrors ? t("destinations.protection.mirrorHint") : t("destinations.protection.mirrorHintNone")}
      >
        <OptionCards
          name="mirrorRetention"
          value={retention}
          onChange={setRetention}
          columns={2}
          label={t("destinations.protection.mirrorRetention")}
          options={[
            { value: "source", icon: <Trash2 />, title: t("destinations.protection.mirrorSource"), hint: t("destinations.protection.mirrorSourceHint") },
            { value: "own", icon: <ShieldCheck />, title: t("destinations.protection.mirrorOwn"), hint: t("destinations.protection.mirrorOwnHint") },
          ]}
        />
      </Field>

      {retention === "own" && (
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              ["mirrorKeepDaily", "keepDaily", keep.daily],
              ["mirrorKeepWeekly", "keepWeekly", keep.weekly],
              ["mirrorKeepMonthly", "keepMonthly", keep.monthly],
            ] as const
          ).map(([name, label, value]) => (
            <Field key={name} label={t(`destinations.protection.${label}`)} htmlFor={`${id}-${name}`}>
              <Input id={`${id}-${name}`} name={name} type="number" min={0} max={1000} step={1} defaultValue={value} required />
            </Field>
          ))}
        </div>
      )}
      {retention === "own" && (
        <p className="-mt-3 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
          <Copy className="mt-0.5 size-3.5 shrink-0" /> {t("destinations.protection.keepHint")}
        </p>
      )}
    </div>
  );
}
