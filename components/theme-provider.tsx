"use client"
import { createContext, useContext, useEffect, useState, useCallback } from "react"

type Theme = "light" | "dark"

interface ThemeCtx {
  theme: Theme
  toggle: () => void
}

const Ctx = createContext<ThemeCtx>({ theme: "light", toggle: () => {} })
export const useTheme = () => useContext(Ctx)

const STORAGE_KEY = "oryx-theme"

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
    const preferred = stored ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    setTheme(preferred)
    document.documentElement.classList.toggle("dark", preferred === "dark")
    setMounted(true)
  }, [])

  const toggle = useCallback(() => {
    setTheme(prev => {
      const next = prev === "light" ? "dark" : "light"
      localStorage.setItem(STORAGE_KEY, next)
      document.documentElement.classList.toggle("dark", next === "dark")
      return next
    })
  }, [])

  // Prevent flash of wrong theme before hydration
  if (!mounted) return null

  return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>
}
