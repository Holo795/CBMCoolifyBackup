"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui";

/** Presentation only: the theme toggle button. Logic in ./index.tsx. */
export function ThemeToggleView({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={onToggle}>
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
