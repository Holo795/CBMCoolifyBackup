"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@/components/ui";
import { DatabaseBackup, Github } from "lucide-react";

/**
 * needsSetup = there are no users yet, so this first registration creates the
 * admin. Once an account exists, registration is closed (enforced server-side
 * in lib/auth.ts) and we only show the sign-in form. canReset = SMTP works, so
 * the "Forgot password?" flow is offered.
 */
export function LoginForm({
  needsSetup,
  hasGithub,
  canReset,
}: {
  needsSetup: boolean;
  hasGithub: boolean;
  canReset: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"auth" | "forgot">("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "forgot") {
        await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
        setNotice("If an account exists for that address, a reset link is on its way.");
        return;
      }
      const name = `${firstName} ${lastName}`.trim() || email.split("@")[0];
      // firstName/lastName are additional fields; pass via a variable so TS keeps
      // them (object literals would trip the excess-property check).
      const signUpBody = { email, password, name, firstName, lastName };
      const res = await (needsSetup
        ? authClient.signUp.email(signUpBody)
        : authClient.signIn.email({ email, password }));
      if (res.error) setError(res.error.message ?? "Authentication failed");
      else router.push("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const forgot = mode === "forgot";

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <DatabaseBackup className="h-6 w-6" />
          </div>
          <CardTitle>CBM - Coolify Backup Manager</CardTitle>
          <p className="text-sm text-muted-foreground">
            {forgot
              ? "Enter your email and we'll send a reset link."
              : needsSetup
                ? "Create the admin account - this first account is the administrator."
                : "Sign in to continue"}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={submit} className="flex flex-col gap-3">
            {needsSetup && !forgot && (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="firstName">First name</Label>
                  <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            {!forgot && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
            )}
            {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
            {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? "…" : forgot ? "Send reset link" : needsSetup ? "Create admin account" : "Sign in"}
            </Button>
          </form>

          {!needsSetup && canReset && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setError(null);
                setNotice(null);
                setMode(forgot ? "auth" : "forgot");
              }}
            >
              {forgot ? "← Back to sign in" : "Forgot password?"}
            </button>
          )}

          {hasGithub && !forgot && (
            <>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
              </div>
              <Button type="button" variant="outline" onClick={() => authClient.signIn.social({ provider: "github" })}>
                <Github className="h-4 w-4" /> Continue with GitHub
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
