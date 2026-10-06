"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateTimezone } from "@/app/actions";
import { useT } from "@/components/i18n-provider";
import { TimezoneFormView } from "./view";

// Full IANA list when the runtime supports it, else a small fallback.
const ZONES: string[] =
  typeof (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf === "function"
    ? (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone")
    : ["UTC", "Europe/Paris", "Europe/London", "America/New_York", "America/Los_Angeles", "Asia/Tokyo"];

export function TimezoneForm({ current }: { current: string }) {
  const t = useT();
  const [tz, setTz] = useState(current);
  const [saved, setSaved] = useState(current);
  const [pending, start] = useTransition();
  const [now, setNow] = useState("");

  useEffect(() => {
    const update = () => setNow(new Date().toLocaleString("en-GB", { timeZone: tz, hour12: false }));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [tz]);

  const onAction = (fd: FormData) =>
    start(async () => {
      const r = await updateTimezone(fd);
      if (r?.error) toast.error(r.error);
      else {
        setSaved(tz);
        toast.success(t("settings.saved"));
      }
    });

  return <TimezoneFormView tz={tz} onTzChange={setTz} zones={ZONES} now={now} onAction={onAction} pending={pending} dirty={tz !== saved} />;
}
