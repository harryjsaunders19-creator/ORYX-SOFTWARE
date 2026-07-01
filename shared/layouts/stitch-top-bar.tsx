"use client"
import { useCallback, useMemo, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Search, HelpCircle, Menu } from "lucide-react"
import { NotificationsMenu } from "@/components/notifications-menu"
import { UserProfileMenu } from "@/components/user-profile-menu"
import { SettingsMenu } from "@/shared/layouts/settings-menu"
import { MODULES } from "@/shared/auth/permissions"

function routeContext(pathname: string): { section: string; trail: string } {
  if (pathname === "/") return { section: "ORYX OS", trail: "Dashboard Overview" }

  const mod = MODULES.find(m => {
    if (m.href === "/") return false
    return pathname === m.href || pathname.startsWith(`${m.href}/`)
  })

  if (mod) {
    const rest = pathname.slice(mod.href.length).replace(/^\//, "")
    const trail = rest
      ? `${mod.label} / ${rest.split("/").map(s => s.replace(/-/g, " ")).join(" / ")}`
      : mod.label
    return { section: "ORYX OS", trail }
  }

  return { section: "ORYX OS", trail: "Oryx Design" }
}

type Props = {
  onMenuClick?: () => void
}

export function StitchTopBar({ onMenuClick }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [query, setQuery] = useState("")

  const { section, trail } = useMemo(() => routeContext(pathname), [pathname])

  const onSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    if (pathname.startsWith("/clients")) {
      router.push(`/clients?search=${encodeURIComponent(q)}`)
    } else if (pathname.startsWith("/quotes")) {
      router.push(`/quotes?search=${encodeURIComponent(q)}`)
    } else {
      router.push(`/jobs?search=${encodeURIComponent(q)}`)
    }
  }, [query, pathname, router])

  return (
    <header
      className="stitch-top-bar fixed top-0 z-40 flex items-center justify-between gap-6 border-b border-bd bg-pg px-6 max-md:gap-3 max-md:px-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="oryx-nav-menu-btn h-11 w-11 shrink-0 items-center justify-center rounded-md text-t2 transition-colors hover:bg-surface-low hover:text-t1"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <h2 className="stitch-top-bar-title hidden shrink-0 uppercase sm:block">
          {section}
        </h2>
        <div className="hidden h-6 w-px shrink-0 bg-bd sm:block" />
        <span className="truncate text-sm text-t3">{trail}</span>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <form
          onSubmit={onSearch}
          className="relative hidden items-center rounded border border-bd bg-surface-low px-2 py-1 md:flex"
        >
          <Search className="h-4 w-4 shrink-0 text-t4" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search parameters…"
            className="ml-1 w-48 border-none bg-transparent py-1 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-0"
          />
        </form>

        <div className="flex items-center gap-1">
          <NotificationsMenu />
          <SettingsMenu />
          <button type="button" className="hidden rounded p-2 text-t3 transition-colors hover:text-t1 sm:block" aria-label="Help">
            <HelpCircle className="h-5 w-5" />
          </button>
        </div>

        <UserProfileMenu />
      </div>
    </header>
  )
}
