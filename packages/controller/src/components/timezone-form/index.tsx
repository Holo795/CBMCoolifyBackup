"use client";

import { useEffect, useState, useTransition } from "react";
import { updateTimezone } from "@/app/actions";
import { TimezoneFormView } from "./view";

// Full IANA list when the runtime supports it, else a small fallback.
const ZONES: string[] =
  typeof (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf === "function"
    ? (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone")
    : ["UTC", "Europe/Paris", "Europe/London", "America/New_York", "America/Los_Angeles", "Asia/Tokyo"];

export function TimezoneForm({ current }: { current: string }) {
  const [tz, setTz] = useState(current);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
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
      setMsg(r?.error ?? "Saved ✓");
    });

  return <TimezoneFormView tz={tz} onTzChange={setTz} zones={ZONES} now={now} onAction={onAction} pending={pending} msg={msg} />;
}
