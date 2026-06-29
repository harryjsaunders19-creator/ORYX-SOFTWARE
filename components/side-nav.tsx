"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, FolderOpen, Activity, Receipt, CalendarDays,
  Building2, AlertTriangle, FileText, Users as UsersIcon, ShieldCheck, DatabaseBackup,
  Sun, Moon, Archive,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useUser } from "@/components/user-context"
import { useTheme } from "@/components/theme-provider"
import { modulesForRole, type ModuleDef } from "@/lib/permissions"
import { OryxLogo } from "@/components/oryx-logo"

const ICONS: Record<string, React.ElementType> = {
  dashboard:  LayoutDashboard,
  clients:    Building2,
  "hold-list": AlertTriangle,
  jobs:       FolderOpen,
  quotes:     FileText,
  calendar:   CalendarDays,
  billing:    Receipt,
  archived:   Archive,
  users:      UsersIcon,
  backups:    DatabaseBackup,
  health:     Activity,
}

const ACTIVE_PREFIX: Record<string, boolean> = {
  "hold-list": true, billing: true,
}

const ADMIN_KEYS = new Set(["billing", "archived", "users", "backups", "health"])

const SIDEBAR_BG     = "#1C1C1E"
const SIDEBAR_BORDER = "rgba(255, 255, 255, 0.08)"
const SIDEBAR_TEXT   = "#A1A1AA"
const SIDEBAR_TEXT_ACTIVE = "#FFFFFF"
const SIDEBAR_AVATAR_BG   = "#2A2A2E"

function UserPanel() {
  const { user, role, logout } = useUser()
  const { theme, toggle } = useTheme()

  const handleLogout = async () => {
    await logout()
    window.location.href = "/login"
  }

  return (
    <div className="px-3 py-3 shrink-0" style={{ borderTop: `1px solid ${SIDEBAR_BORDER}` }}>
      <div className="flex items-center gap-2 px-1">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: SIDEBAR_AVATAR_BG }}
        >
          <ShieldCheck className="h-3.5 w-3.5" style={{ color: role === "ADMIN" ? "#A5A0F0" : SIDEBAR_TEXT }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate" style={{ color: SIDEBAR_TEXT_ACTIVE }}>{user?.name ?? "—"}</p>
          <p className="text-[10px]" style={{ color: SIDEBAR_TEXT }}>{role === "ADMIN" ? "Admin" : "Engineer"}</p>
        </div>
        <button
          onClick={toggle}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="p-1 rounded-md shrink-0 hover:bg-white/10 transition-colors"
          style={{ color: SIDEBAR_TEXT, background: "none", border: "none", cursor: "pointer" }}
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={handleLogout}
          className="text-[11px] shrink-0 underline hover:opacity-80"
          style={{ color: SIDEBAR_TEXT, background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          Log out
        </button>
      </div>
    </div>
  )
}

function NavLink({ item, active }: { item: ModuleDef; active: boolean }) {
  const Icon = ICONS[item.key] ?? FolderOpen
  return (
    <Link
      href={item.href}
      className={cn(
        "mx-2 flex items-center gap-3 rounded-lg px-4 py-3 text-[13px] font-medium outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ac focus-visible:ring-inset",
        active
          ? "bg-ac text-white shadow-sm"
          : "text-[#A1A1AA] hover:bg-white/10 hover:text-white",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" style={{ opacity: active ? 1 : 0.85 }} />
      {item.label}
    </Link>
  )
}

export function SideNav() {
  const path = usePathname()
  const { role } = useUser()
  const nav = modulesForRole(role)
  const mainNav = nav.filter(m => !ADMIN_KEYS.has(m.key))
  const adminNav = nav.filter(m => ADMIN_KEYS.has(m.key))

  const isActive = (key: string, href: string) =>
    ACTIVE_PREFIX[key] ? path.startsWith(href) : path === href

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 z-40 flex flex-col shadow-sidebar"
      style={{
        width: "260px",
        backgroundColor: SIDEBAR_BG,
        borderRight: `1px solid ${SIDEBAR_BORDER}`,
      }}
    >
      {/* Logo */}
      <div
        className="px-4 py-5 flex items-center justify-center shrink-0"
        style={{ borderBottom: `1px solid ${SIDEBAR_BORDER}` }}
      >
        <Link href="/" className="block w-full max-w-[160px]">
          <OryxLogo variant="sidebar" />
        </Link>
      </div>

      <nav className="flex-1 py-4 flex flex-col gap-0.5 overflow-y-auto thin-scroll">
        {mainNav.map(item => (
          <NavLink key={item.href} item={item} active={isActive(item.key, item.href)} />
        ))}

        {adminNav.length > 0 && (
          <>
            <div className="mx-4 my-3 border-t" style={{ borderColor: "rgba(255,255,255,0.1)" }} />
            {adminNav.map(item => (
              <NavLink key={item.href} item={item} active={isActive(item.key, item.href)} />
            ))}
          </>
        )}
      </nav>

      <UserPanel />

      <div className="px-5 py-3 shrink-0" style={{ borderTop: `1px solid ${SIDEBAR_BORDER}` }}>
        <p className="text-[11px]" style={{ color: SIDEBAR_TEXT }}>Oryx Design Ltd · 2026</p>
      </div>
    </aside>
  )
}
