"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import dynamic from "next/dynamic"
import { Search, Menu, ExternalLink } from "lucide-react"
import { NotificationsMenu } from "@/components/notifications-menu"
import { UserProfileMenu } from "@/components/user-profile-menu"
import { SettingsMenu } from "@/shared/layouts/settings-menu"
import { MODULES } from "@/shared/auth/permissions"
import { useUser } from "@/shared/providers/user-context"

const CommandPalette = dynamic(
  () => import("@/modules/search/components/command-palette").then(m => m.CommandPalette),
  { ssr: false },
)

function looksLikeId(segment: string): boolean {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(segment)) {
    return true
  }
  // cuid / cuid2 / nanoid-style ids — long opaque tokens, not kebab page names
  if (/^[a-z0-9_-]{16,}$/i.test(segment) && !/^[a-z]+(?:-[a-z0-9]+)+$/i.test(segment)) {
    return true
  }
  return false
}

function routeContext(pathname: string): { section: string; trail: string } {
  if (pathname === "/") return { section: "ORYX OS", trail: "Dashboard" }

  // Prefer the longest href match so /clients/hold-list resolves to Hold List,
  // not Clients (which also prefix-matches).
  const mod = MODULES
    .filter(m => m.href !== "/")
    .filter(m => pathname === m.href || pathname.startsWith(`${m.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]

  if (mod) {
    const rest = pathname.slice(mod.href.length).replace(/^\//, "")
    if (!rest) return { section: "ORYX OS", trail: mod.label }

    const parts = rest.split("/").filter(Boolean)
    const readable = parts
      .filter(p => !looksLikeId(p))
      .map(p => p.replace(/-/g, " "))

    if (!readable.length) {
      const singular = mod.label.endsWith("s") ? mod.label.slice(0, -1) : mod.label
      return { section: "ORYX OS", trail: `${singular} detail` }
    }

    return { section: "ORYX OS", trail: `${mod.label} / ${readable.join(" / ")}` }
  }

  return { section: "ORYX OS", trail: "ORYX Design" }
}

type Props = {
  onMenuClick?: () => void
}

export function StitchTopBar({ onMenuClick }: Props) {
  const pathname = usePathname()
  const [searchOpen, setSearchOpen] = useState(false)
  const { user } = useUser()

  const { section, trail } = useMemo(() => routeContext(pathname), [pathname])
  const isDashboard = pathname === "/"

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
        className="stitch-top-bar fixed top-0 z-40 flex items-center justify-between gap-6 px-6 max-md:gap-3 max-md:px-4"
      >
        <div className="flex min-w-0 flex-1 items-center gap-4">
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

          {!isDashboard && (
            <>
              <h2 className="stitch-top-bar-title hidden shrink-0 sm:block">
                {section}
              </h2>
              <div className="hidden h-6 w-px shrink-0 bg-bd sm:block" />
              <span className="hidden truncate text-sm text-t3 sm:inline">{trail}</span>
            </>
          )}

          <button
            type="button"
            onClick={openSearch}
            className="relative hidden w-full max-w-md items-center gap-2 rounded-full bg-[var(--stitch-search-bg)] py-2 pl-10 pr-4 text-left transition-shadow hover:ring-1 hover:ring-black/10 md:flex"
            aria-label="Open global search"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t3" />
            <span className="truncate text-sm font-medium text-t3">
              Search drawings, clients, sites or CAD files...
            </span>
            <kbd className="ml-auto rounded border border-bd bg-sr px-1.5 py-0.5 type-badge text-t4">
              Ctrl K
            </kbd>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-4 md:gap-6">
          <button
            type="button"
            onClick={openSearch}
            className="flex h-9 w-9 items-center justify-center rounded-md text-t2 transition-colors hover:bg-surface-low hover:text-t1 md:hidden"
            aria-label="Open global search"
          >
            <Search className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3 border-r border-bd pr-4 md:gap-4 md:pr-6">
            <NotificationsMenu />
            <SettingsMenu />
            <a
              href="https://www.oryxdesignltd.co.uk/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1.5 rounded px-2 py-2 text-sm font-medium text-t3 transition-colors hover:bg-surface-low hover:text-t1 sm:inline-flex"
            >
              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
              Website
            </a>
          </div>

          <div className="flex items-center gap-3 pl-0.5">
            {user && (
              <p className="hidden text-sm font-medium leading-none text-t1 sm:block">
                {user.name}
              </p>
            )}
            <UserProfileMenu />
          </div>
        </div>
      </header>

      {searchOpen ? (
        <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      ) : null}
    </>
  )
}
