import { requireUser } from "@/lib/session";
import { AppLayoutView } from "./layout-view";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const role = (user as { role?: string }).role ?? "viewer";
  return (
    <AppLayoutView name={user.name || user.email} role={role}>
      {children}
    </AppLayoutView>
  );
}
