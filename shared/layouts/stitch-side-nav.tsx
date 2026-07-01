"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, FolderOpen, Activity, Receipt, CalendarDays,
  Building2, AlertTriangle, FileText, Users as UsersIcon, DatabaseBackup, Archive,
  GitBranch, UsersRound,
} from "lucide-react"
import { cn } from "@/shared/utils"
import { useUser } from "@/shared/providers/user-context"
import { modulesForRole, type ModuleDef } from "@/shared/auth/permissions"
import { OryxLogo } from "@/shared/branding/oryx-logo"
import { STITCH_SIDEBAR_W, STITCH_SIDEBAR_BG, STITCH_SIDEBAR_BORDER } from "@/shared/branding/stitch-layout"

const ICONS: Record<string, React.ElementType> = {
  dashboard:  LayoutDashboard,
  clients:    Building2,
  "hold-list": AlertTriangle,
  jobs:       GitBranch,
  quotes:     FileText,
  calendar:   CalendarDays,
  employees:  UsersRound,
  billing:    Receipt,
  archived:   Archive,
  users:      UsersIcon,
  backups:    DatabaseBackup,
  health:     Activity,
}

const ACTIVE_PREFIX: Record<string, boolean> = {
  "hold-list": true, billing: true, clients: true, jobs: true, employees: true,
}

const ADMIN_KEYS = new Set(["billing", "archived", "users", "backups", "health"])

function NavLink({ item, active }: { item: ModuleDef; active: boolean }) {
  const Icon = ICONS[item.key] ?? FolderOpen
  return (
    <Link
      href={item.href}
      data-active={active ? "true" : "false"}
      className={cn(
        "stitch-nav-link flex items-center gap-3 px-4 py-3 text-sm transition-all duration-150 ease-in-out outline-none",
        "focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-inset -ml-px pl-[15px]",
      )}
    >
      <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.25 : 2} />
      {item.label}
    </Link>
  )
}

export function StitchSideNav() {
  const path = usePathname()
  const { role } = useUser()
  const nav = modulesForRole(role)
  const mainNav = nav.filter(m => !ADMIN_KEYS.has(m.key))
  const adminNav = nav.filter(m => ADMIN_KEYS.has(m.key))

  const isActive = (key: string, href: string) => {
    if (key === "dashboard") return path === "/"
    return ACTIVE_PREFIX[key] ? path.startsWith(href) : path === href
  }

  return (
    <aside
      id="oryx-stitch-sidebar"
      className="stitch-sidebar fixed left-0 top-0 bottom-0 z-50 flex flex-col py-4"
      style={{
        width: STITCH_SIDEBAR_W,
        backgroundColor: STITCH_SIDEBAR_BG,
        borderRight: `1px solid ${STITCH_SIDEBAR_BORDER}`,
      }}
    >
      <div className="mb-6 px-4">
        <Link href="/" className="block transition-opacity hover:opacity-90">
          <OryxLogo variant="menu" className="mb-2" />
          <p className="stitch-sidebar-brand-sub">
            {role === "ADMIN" ? "Internal Admin" : "Engineer Terminal"}
          </p>
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto thin-scroll">
        {mainNav.map(item => (
          <NavLink key={item.href} item={item} active={isActive(item.key, item.href)} />
        ))}

        {adminNav.length > 0 && (
          <div
            className="mt-2 space-y-0.5 border-t pt-2"
            style={{ borderColor: "rgba(255, 255, 255, 0.1)" }}
          >
            {adminNav.map(item => (
              <NavLink key={item.href} item={item} active={isActive(item.key, item.href)} />
            ))}
          </div>
        )}
      </nav>
    </aside>
  )
}
