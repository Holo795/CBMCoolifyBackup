/** The status a snapshot is shown with: a succeeded one that carries warnings
 * (a database that couldn't be dumped...) reads "warning", not "succeeded". */
export function shownStatus(s: { status: string; warnings: string[] }): string {
  return s.status === "succeeded" && s.warnings.length ? "warning" : s.status;
}
