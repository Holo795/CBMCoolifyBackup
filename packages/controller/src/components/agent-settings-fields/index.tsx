"use client";

import { AGENT_SETTING_ENV, type AgentSettings, type AgentSettingKey } from "@cbm/shared";
import { Field, Input, Select } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

/**
 * The agent settings fields, for the defaults panel and an agent's own panel.
 * An empty field inherits (`inherited` shows what that means). A setting the
 * host fixes with an environment variable is shown locked; its stored value is
 * kept as is.
 */
export function AgentSettingsFields({
  values,
  inherited,
  locked = [],
  inEffect,
}: {
  values: AgentSettings;
  inherited: Required<AgentSettings>;
  locked?: string[];
  inEffect?: AgentSettings | null;
}) {
  const t = useT();
  const isLocked = (k: AgentSettingKey) => locked.includes(k);
  // An empty field shows what it falls back to; a locked one, what the host runs with.
  const shown = (k: AgentSettingKey, label?: (v: string) => string) => {
    if (isLocked(k) && inEffect?.[k] !== undefined) {
      const v = String(inEffect[k]);
      return t("agents.settings.onHost", { value: label ? label(v) : v });
    }
    const v = String(inherited[k]);
    return t("agents.settings.inherit", { value: label ? label(v) : v });
  };
  const hint = (k: AgentSettingKey, base: string) =>
    isLocked(k)
      ? t("agents.settings.lockedByEnv", { env: AGENT_SETTING_ENV[k] })
      : inEffect?.[k] !== undefined && inEffect[k] !== (values[k] ?? inherited[k])
        ? `${base} ${t("agents.settings.inEffect", { value: String(inEffect[k]) })}`
        : base;
  // A disabled field isn't submitted: keep a locked setting's stored value.
  const keep = (k: AgentSettingKey) =>
    isLocked(k) && values[k] !== undefined ? <input type="hidden" name={k} value={String(values[k])} /> : null;
  const freezeLabel = { pause: t("agents.settings.freezePause"), cgroup: t("agents.settings.freezeCgroup") };
  const stagingLabel = { auto: t("agents.settings.stagingAuto"), local: t("agents.settings.stagingLocal"), direct: t("agents.settings.stagingDirect") };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label={t("agents.settings.concurrency")} htmlFor="as-concurrency" hint={hint("concurrency", t("agents.settings.concurrencyHint"))}>
          {keep("concurrency")}
          <Input
            id="as-concurrency"
            name="concurrency"
            type="number"
            min={1}
            max={16}
            defaultValue={values.concurrency ?? ""}
            placeholder={shown("concurrency")}
            disabled={isLocked("concurrency")}
          />
        </Field>
        <Field label={t("agents.settings.minFree")} htmlFor="as-minfree" hint={hint("minFreeMb", t("agents.settings.minFreeHint"))}>
          {keep("minFreeMb")}
          <Input
            id="as-minfree"
            name="minFreeMb"
            type="number"
            min={0}
            step={256}
            defaultValue={values.minFreeMb ?? ""}
            placeholder={shown("minFreeMb")}
            disabled={isLocked("minFreeMb")}
          />
        </Field>
      </div>
      <Field label={t("agents.settings.stagingMode")} htmlFor="as-staging" hint={hint("stagingMode", t("agents.settings.stagingHint"))}>
        {keep("stagingMode")}
        <Select id="as-staging" name="stagingMode" defaultValue={values.stagingMode ?? ""} disabled={isLocked("stagingMode")}>
          <option value="">{shown("stagingMode", (v) => stagingLabel[v as keyof typeof stagingLabel] ?? v)}</option>
          {(["auto", "local", "direct"] as const).map((m) => (
            <option key={m} value={m}>
              {stagingLabel[m]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field
          label={t("agents.settings.resticReadConcurrency")}
          htmlFor="as-restic-read"
          hint={hint("resticReadConcurrency", t("agents.settings.resticReadConcurrencyHint"))}
        >
          {keep("resticReadConcurrency")}
          <Input
            id="as-restic-read"
            name="resticReadConcurrency"
            type="number"
            min={1}
            max={32}
            defaultValue={values.resticReadConcurrency ?? ""}
            placeholder={shown("resticReadConcurrency")}
            disabled={isLocked("resticReadConcurrency")}
          />
        </Field>
        <Field
          label={t("agents.settings.resticPackSize")}
          htmlFor="as-restic-pack"
          hint={hint("resticPackSize", t("agents.settings.resticPackSizeHint"))}
        >
          {keep("resticPackSize")}
          <Input
            id="as-restic-pack"
            name="resticPackSize"
            type="number"
            min={4}
            max={128}
            defaultValue={values.resticPackSize ?? ""}
            placeholder={shown("resticPackSize")}
            disabled={isLocked("resticPackSize")}
          />
        </Field>
      </div>
      <Field label={t("agents.settings.freezeMethod")} htmlFor="as-freeze" hint={hint("freezeMethod", t("agents.settings.freezeHint"))}>
        {keep("freezeMethod")}
        <Select id="as-freeze" name="freezeMethod" defaultValue={values.freezeMethod ?? ""} disabled={isLocked("freezeMethod")}>
          <option value="">{shown("freezeMethod", (v) => freezeLabel[v as keyof typeof freezeLabel] ?? v)}</option>
          {(["pause", "cgroup"] as const).map((m) => (
            <option key={m} value={m}>
              {freezeLabel[m]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("agents.settings.logLevel")} htmlFor="as-log" hint={isLocked("logLevel") ? hint("logLevel", "") : undefined}>
        {keep("logLevel")}
        <Select id="as-log" name="logLevel" defaultValue={values.logLevel ?? ""} disabled={isLocked("logLevel")} className="sm:max-w-xs">
          <option value="">{shown("logLevel")}</option>
          {(["debug", "info", "warn", "error"] as const).map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
