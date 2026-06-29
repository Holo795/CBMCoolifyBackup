"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { TopbarView } from "./view";

/** Logic only: wires the search shortcut + sign-out. Markup is in ./view.tsx. */
export function Topbar({ name }: { name: string }) {
  const router = useRouter();

  const onSearch = () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  const onSignOut = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  return <TopbarView name={name} onSearch={onSearch} onSignOut={onSignOut} />;
}
