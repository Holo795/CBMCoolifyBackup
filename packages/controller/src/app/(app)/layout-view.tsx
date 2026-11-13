import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { CommandPalette } from "@/components/command-palette";
import { ActivityBar } from "@/components/activity-bar";
import { RoleProvider } from "@/components/role-gate";
import { TooltipProvider } from "@/components/ui";
import { Toaster } from "@/components/toaster";
import { ShieldAlert } from "lucide-react";

const WEAK_SECRETS_DOC = "https://github.com/Holo795/CBMCoolifyBackup/wiki/Configuration#weak-secrets";

/** Presentation only: the authenticated app shell. Data is fetched in ./layout.tsx. */
export function AppLayoutView({
  name,
  email,
  role,
  weakSecrets,
  children,
}: {
  name: string;
  email?: string;
  role: string;
  /** Admins only: what makes the install's secrets guessable. */
  weakSecrets?: { title: string; items: string[]; fix: string };
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-dvh overflow-clip">
        <Sidebar role={role} name={name} email={email} />
        <div className="flex min-w-0 flex-1 flex-col overflow-clip">
          <MobileNav role={role} name={name} email={email} />
          <main className="relative flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-24 sm:px-8 sm:pt-8">
              {weakSecrets && (
                <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-[13px] text-danger">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-medium">{weakSecrets.title}</p>
                    {weakSecrets.items.map((i) => (
                      <p key={i}>{i}</p>
                    ))}
                    <a className="underline underline-offset-2" href={WEAK_SECRETS_DOC} target="_blank" rel="noreferrer">
                      {weakSecrets.fix}
                    </a>
                  </div>
                </div>
              )}
              <RoleProvider role={role}>{children}</RoleProvider>
            </div>
          </main>
          <ActivityBar />
        </div>
        <CommandPalette role={role} />
      </div>
      <Toaster />
    </TooltipProvider>
  );
}
