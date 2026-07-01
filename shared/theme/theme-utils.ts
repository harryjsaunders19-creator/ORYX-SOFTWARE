export type ThemePreference = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

export const THEME_STORAGE_KEY = "oryx-theme"

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system"
}

export function resolveTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): ResolvedTheme {
  if (preference === "dark") return "dark"
  if (preference === "light") return "light"
  return prefersDark ? "dark" : "light"
}

export function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system"
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(stored) ? stored : "system"
  } catch {
    return "system"
  }
}

export function applyResolvedTheme(resolved: ResolvedTheme): void {
  document.documentElement.classList.toggle("dark", resolved === "dark")
}

/** Inline script body — keep in sync with theme-utils (runs before React hydrates). */
export const THEME_INIT_SCRIPT = `(function(){try{
  var k="oryx-theme",s=localStorage.getItem(k);
  var p=(s==="light"||s==="dark"||s==="system")?s:"system";
  var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark",d);
}catch(e){}})()`
