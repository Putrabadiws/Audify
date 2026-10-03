import { useCallback, useEffect, useState } from "react";

export const THEMES = ["auto", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

const STORAGE_KEY = "audify-theme";

function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** localStorage is user-editable: anything unexpected falls back to Auto. */
export function readStoredTheme(): Theme {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(value) ? value : "auto";
  } catch {
    return "auto";
  }
}

/** Auto = no data-theme attribute, so the CSS prefers-color-scheme block decides. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // follow macOS switching light/dark while the app is open (only matters in Auto)
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // private mode / storage full: theme still applies for this session
    }
  }, []);

  const isDark = theme === "dark" || (theme === "auto" && systemDark);

  // Toolbar moon/sun button: flip to the opposite of what is currently visible.
  const toggle = useCallback(() => setTheme(isDark ? "light" : "dark"), [isDark, setTheme]);

  return { theme, isDark, setTheme, toggle };
}
