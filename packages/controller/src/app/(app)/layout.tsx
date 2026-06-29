import { requireUser } from "@/lib/session";
import { AppLayoutView } from "./layout-view";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppLayoutView name={user.name || user.email}>{children}</AppLayoutView>;
}
