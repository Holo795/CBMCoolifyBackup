"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

/** Presentation only: the theme toggle button. Logic in ./index.tsx. */
export function ThemeToggleView({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  const t = useT();
  return (
    <Button variant="ghost" size="icon" aria-label={t("common.toggleTheme")} onClick={onToggle}>
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
