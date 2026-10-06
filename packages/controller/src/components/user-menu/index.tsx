"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { authClient } from "@/lib/auth-client";
import { setLocale } from "@/app/actions";
import { useLocale } from "@/components/i18n-provider";
import { UserMenuView } from "./view";

/** Account menu (profile, theme, language, sign out). Logic only. */
export function UserMenu({ name, email, role }: { name: string; email?: string; role: string }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const [, start] = useTransition();

  const onLocale = (l: string) => {
    if (l === locale) return;
    start(async () => {
      await setLocale(l);
      router.refresh();
    });
  };
  const onSignOut = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  return (
    <UserMenuView
      name={name}
      email={email}
      role={role}
      theme={theme ?? "system"}
      onTheme={setTheme}
      locale={locale}
      onLocale={onLocale}
      onSignOut={onSignOut}
    />
  );
}
