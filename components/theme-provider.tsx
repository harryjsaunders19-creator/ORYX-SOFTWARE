"use client"
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react"

type Theme = "light" | "dark"

interface ThemeCtx {
  theme: Theme
  toggle: () => void
}

const Ctx = createContext<ThemeCtx>({ theme: "light", toggle: () => {} })
export const useTheme = () => useContext(Ctx)

const STORAGE_KEY = "oryx-theme"

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Default to "light" — the inline <script> in layout.tsx already applied the
  // correct class to <html> before React hydrates, so there is no flash.
  // We no longer block rendering with a `mounted` guard; the effect below
  // syncs React state with the class that is already on the DOM.
  const [theme, setTheme] = useState<Theme>("light")

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
    const preferred = stored ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    setTheme(preferred)
    document.documentElement.classList.toggle("dark", preferred === "dark")
  }, [])

  const toggle = useCallback(() => {
    setTheme(prev => {
      const next = prev === "light" ? "dark" : "light"
      localStorage.setItem(STORAGE_KEY, next)
      document.documentElement.classList.toggle("dark", next === "dark")
      return next
    })
  }, [])

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
