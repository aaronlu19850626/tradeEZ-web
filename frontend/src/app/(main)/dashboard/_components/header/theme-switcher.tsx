"use client";

import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

export function ThemeSwitcher() {
  const mode = usePreferencesStore((state) => state.values.theme_mode);
  const setPreference = usePreferencesStore((state) => state.setPreference);
  const next = mode === "dark" ? "light" : "dark";

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-9 min-h-9 px-3"
      onClick={() => setPreference("theme_mode", next)}
      aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {mode === "dark" ? <Sun /> : <Moon />}
      <span className="hidden xl:inline">{mode === "dark" ? "Light" : "Dark"}</span>
    </Button>
  );
}
