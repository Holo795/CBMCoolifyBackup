"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { ThemeToggleView } from "./view";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <ThemeToggleView isDark={mounted && theme === "dark"} onToggle={() => setTheme(theme === "dark" ? "light" : "dark")} />
  );
}
