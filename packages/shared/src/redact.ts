/**
 * Mask credentials in free text before it is logged, stored (job events,
 * snapshot/job errors) or sent out (webhook alerts). Defense in depth: commands
 * no longer carry secrets in their arguments, but tool output and older errors
 * still might.
 */
const RULES: Array<[RegExp, string]> = [
  // KEY=value for password/secret/token-like variable names (PGPASSWORD=…, MYSQL_PWD=…).
  [/\b([A-Z0-9_]*(?:PASSWORD|PASSWD|PWD|SECRET|TOKEN|_AUTH|APIKEY|API_KEY)[A-Z0-9_]*)=("[^"]*"|'[^']*'|\S+)/gi, "$1=***"],
  // --password=… / --password '…' / --pass …
  [/(--(?:password|passwd|pass|secret|token)(?:=|\s+))("[^"]*"|'[^']*'|\S+)/gi, "$1***"],
  // mysql-style -p'…' / -psecret (but not -p alone or -P port)
  [/(\s-p)('[^']*'|"[^"]*"|[^\s'"]+)/g, "$1***"],
  // user:password@ in connection URLs
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s@/]+)@/gi, "$1***@"],
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const [re, repl] of RULES) out = out.replace(re, repl);
  return out;
}
