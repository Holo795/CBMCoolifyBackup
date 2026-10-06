import type { T } from "./i18n-shared";
import { timeAgo } from "./cn";
import type { ProtectionDetail, ProtectionStatus } from "./protection-check";

/** A protection-check detail as a sentence, optionally with when it ran. */
export function protectionDetailText(t: T, d: ProtectionDetail | null, checkedAt?: Date | null): string {
  const parts: string[] = [];
  if (d?.code === "ok") {
    parts.push(
      d.days != null
        ? t("destinations.protection.detail.ok", { days: d.days })
        : d.days === null
          ? t("destinations.protection.detail.okForever")
          : t("destinations.protection.detail.okUnknown"),
    );
  } else if (d?.code === "error") parts.push(d.error);
  else if (d) parts.push(t(`destinations.protection.detail.${d.code}`));
  if (checkedAt) parts.push(t("destinations.protection.detail.checked", { when: timeAgo(checkedAt, t) }));
  return parts.join(" ");
}

/** The outcome of a check, for a toast: verdict, then why. */
export function protectionResultText(t: T, r: { status: ProtectionStatus; detail: ProtectionDetail }): string {
  return `${t(`destinations.protection.result.${r.status}`)} ${protectionDetailText(t, r.detail)}`;
}
