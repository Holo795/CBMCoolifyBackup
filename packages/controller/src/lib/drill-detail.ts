// The agent reports each drill check as an English sentence (it has no locale).
// Map the known ones to the UI language; anything else (errors) shows as sent.
type T = (key: string, vars?: Record<string, string | number>) => string;

const PATTERNS: [RegExp, string, string[]][] = [
  [/^empty database - the dump loaded cleanly into (.+)$/, "emptyDb", ["image"]],
  [/^restored (\d+)\/(\d+) tables into a sandbox (.+)$/, "tablesOk", ["restored", "declared", "image"]],
  [/^only (\d+)\/(\d+) tables restored into (.+) - the dump did not load completely$/, "tablesPartial", ["restored", "declared", "image"]],
  [/^restored (\d+) collection\(s\) into a sandbox (.+)$/, "collections", ["n", "image"]],
  [/^not a valid RDB file \(bad header\)$/, "rdbBad", []],
  [/^RDB header valid \(a full load is only drilled for redis\)$/, "rdbHeaderOnly", []],
  [/^loaded (\d+) key\(s\) into a sandbox (.+)$/, "keys", ["n", "image"]],
  [/^no sandbox for engine "(.*)" - skipped$/, "noSandbox", ["engine"]],
  [/^empty archive \(read back fine\)$/, "emptyArchive", []],
  [/^(\d+) entries read back$/, "entries", ["n"]],
  [/^present and readable$/, "present", []],
  [/^empty file$/, "emptyFile", []],
];

export function localizeDrillDetail(detail: string, t: T): string {
  for (const [re, key, names] of PATTERNS) {
    const m = re.exec(detail);
    if (m) return t(`snapshots.drillDetail.${key}`, Object.fromEntries(names.map((n, i) => [n, m[i + 1]])));
  }
  return detail;
}
