import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { CommandPalette } from "@/components/command-palette";
import { ActivityBar } from "@/components/activity-bar";
import { RoleProvider } from "@/components/role-gate";
import { TooltipProvider } from "@/components/ui";
import { Toaster } from "@/components/toaster";

/** Presentation only: the authenticated app shell. Data is fetched in ./layout.tsx. */
export function AppLayoutView({
  name,
  email,
  role,
  children,
}: {
  name: string;
  email?: string;
  role: string;
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-dvh overflow-hidden">
        <Sidebar role={role} name={name} email={email} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <MobileNav role={role} name={name} email={email} />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-24 sm:px-8 sm:pt-8">
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
