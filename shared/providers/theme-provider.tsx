"use client"
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react"
import {
  type ThemePreference,
  type ResolvedTheme,
  THEME_STORAGE_KEY,
  readStoredPreference,
  resolveTheme,
  applyResolvedTheme,
} from "@/shared/theme/theme-utils"

interface ThemeCtx {
  preference: ThemePreference
  resolvedTheme: ResolvedTheme
  setThemePreference: (preference: ThemePreference) => void
}

const Ctx = createContext<ThemeCtx>({
  preference: "system",
  resolvedTheme: "light",
  setThemePreference: () => {},
})

export const useTheme = () => useContext(Ctx)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>("system")
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light")

  useEffect(() => {
    const pref = readStoredPreference()
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    const resolved = resolveTheme(pref, prefersDark)
    setPreference(pref)
    setResolvedTheme(resolved)
    applyResolvedTheme(resolved)

    if (pref !== "system") return

    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      const next = resolveTheme("system", mq.matches)
      setResolvedTheme(next)
      applyResolvedTheme(next)
    }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  const setThemePreference = useCallback((next: ThemePreference) => {
    localStorage.setItem(THEME_STORAGE_KEY, next)
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    const resolved = resolveTheme(next, prefersDark)
    setPreference(next)
    setResolvedTheme(resolved)
    applyResolvedTheme(resolved)
  }, [])

  const value = useMemo(
    () => ({ preference, resolvedTheme, setThemePreference }),
    [preference, resolvedTheme, setThemePreference],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
