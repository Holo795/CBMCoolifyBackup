"use client";

import { ActionButton } from "@/components/action-button";
import { useT } from "@/components/i18n-provider";
import { resumeAfterRecovery } from "@/app/actions";

/** Admins: end the hold after a recovery-file import (see lib/recovery-hold). */
export function ResumeAfterRecoveryButton() {
  const t = useT();
  return (
    <div>
      <ActionButton action={resumeAfterRecovery} confirm={t("common.recoveryHold.confirm")} successMsg={t("common.recoveryHold.resumed")}>
        {t("common.recoveryHold.resume")}
      </ActionButton>
    </div>
  );
}
