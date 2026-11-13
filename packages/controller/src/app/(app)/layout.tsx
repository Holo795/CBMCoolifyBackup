import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n";
import { secretWeaknesses } from "@/lib/startup-check";
import { AppLayoutView } from "./layout-view";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const role = (user as { role?: string }).role ?? "viewer";
  // Admins see, on every page, what makes this install's secrets guessable (a
  // new install with them doesn't start - see lib/startup-check).
  let weakSecrets: { title: string; items: string[]; fix: string } | undefined;
  if (role === "admin" && process.env.NODE_ENV === "production") {
    const weak = secretWeaknesses({
      authSecret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET,
      masterKey: process.env.MASTER_KEY,
    });
    if (weak.length) {
      const t = await getT();
      weakSecrets = {
        title: t("common.weakSecrets.title"),
        items: weak.map((w) => t(w === "auth-secret-weak" ? "common.weakSecrets.authSecret" : "common.weakSecrets.masterKey")),
        fix: t("common.weakSecrets.fix"),
      };
    }
  }
  return (
    <AppLayoutView name={user.name || user.email} email={user.email} role={role} weakSecrets={weakSecrets}>
      {children}
    </AppLayoutView>
  );
}
