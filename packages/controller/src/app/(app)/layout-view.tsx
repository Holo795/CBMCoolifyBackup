import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { CommandPalette } from "@/components/command-palette";
import { RoleProvider } from "@/components/role-gate";

/** Presentation only: the authenticated app shell. Data is fetched in ./layout.tsx. */
export function AppLayoutView({
  name,
  role,
  children,
}: {
  name: string;
  role: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar name={name} role={role} />
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="mx-auto max-w-6xl">
            <RoleProvider role={role}>{children}</RoleProvider>
          </div>
        </main>
      </div>
      <CommandPalette role={role} />
    </div>
  );
}
