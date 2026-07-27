"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { Search, HelpCircle, Menu, ExternalLink, Mail } from "lucide-react"
import { NotificationsMenu } from "@/components/notifications-menu"
import { UserProfileMenu } from "@/components/user-profile-menu"
import { SettingsMenu } from "@/shared/layouts/settings-menu"
import { CommandPalette } from "@/modules/search/components/command-palette"
import { MODULES } from "@/shared/auth/permissions"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

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
  const pathname = usePathname()
  const [searchOpen, setSearchOpen] = useState(false)

  const { section, trail } = useMemo(() => routeContext(pathname), [pathname])

  const openSearch = useCallback(() => setSearchOpen(true), [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <>
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
          <button
            type="button"
            onClick={openSearch}
            className="relative hidden items-center gap-2 rounded border border-bd bg-surface-low px-2 py-1.5 text-left transition-colors hover:border-bds hover:bg-sr md:flex"
            aria-label="Open global search"
          >
            <Search className="h-4 w-4 shrink-0 text-t4" />
            <span className="w-36 truncate text-sm text-t4">Search everything…</span>
            <kbd className="rounded border border-bd bg-sr px-1.5 py-0.5 text-[10px] font-medium text-t4">
              Ctrl K
            </kbd>
          </button>

          <button
            type="button"
            onClick={openSearch}
            className="flex h-9 w-9 items-center justify-center rounded-md text-t2 transition-colors hover:bg-surface-low hover:text-t1 md:hidden"
            aria-label="Open global search"
          >
            <Search className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-1">
            <NotificationsMenu />
            <SettingsMenu />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="hidden rounded p-2 text-t3 transition-colors hover:text-t1 sm:block" aria-label="Help">
                  <HelpCircle className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-3 py-2">
                  <p className="text-xs font-medium text-t1">ORYX OS</p>
                  <p className="text-xs text-t4">v{process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0"}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href="mailto:support@oryxgroup.co.uk" className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5" /> Email support
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href="https://oryxgroup.co.uk" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                    <ExternalLink className="h-3.5 w-3.5" /> Oryx website
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <UserProfileMenu />
        </div>
      </header>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  )
}
