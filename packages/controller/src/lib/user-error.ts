// User-facing errors raised by library code (jobs, self-backup…). The Error
// message is the English text, so logs and the /api/v1 REST API stay English;
// server actions translate `key` + `vars` for the UI with errorText().
import { dictionaries } from "@/i18n/dictionaries";
import { translate, type T } from "./i18n-shared";

export type MsgVars = Record<string, string | number>;

export class UserError extends Error {
  constructor(
    readonly key: string,
    readonly vars: MsgVars = {},
  ) {
    super(translate(dictionaries.en, key, vars));
    this.name = "UserError";
  }
}

/** The text to show for a caught error: translated when it's a UserError,
 * otherwise its (untranslatable) message as-is. */
export function errorText(e: unknown, t: T): string {
  if (e instanceof UserError) return t(e.key, e.vars);
  return e instanceof Error ? e.message : String(e);
}
