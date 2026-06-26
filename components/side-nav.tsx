"use client"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, FolderOpen, Activity, Receipt, CalendarDays,
  Building2, AlertTriangle, FileText, Users as UsersIcon, ShieldCheck, DatabaseBackup,
  Sun, Moon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useUser } from "@/components/user-context"
import { useTheme } from "@/components/theme-provider"
import { modulesForRole } from "@/lib/permissions"

// Icons live here (not in lib/permissions.ts) so that file stays framework-agnostic.
const ICONS: Record<string, React.ElementType> = {
  dashboard:  LayoutDashboard,
  clients:    Building2,
  "hold-list": AlertTriangle,
  jobs:       FolderOpen,
  quotes:     FileText,
  calendar:   CalendarDays,
  billing:    Receipt,
  users:      UsersIcon,
  backups:    DatabaseBackup,
  health:     Activity,
}

// Sub-paths under a module's main href that should still count as "active"
const ACTIVE_PREFIX: Record<string, boolean> = {
  "hold-list": true, billing: true,
}

// The sidebar is the one place in the UI that's intentionally dark — the ink
// half of the monochrome identity lives here permanently, so the light
// content area can stay airy. These are one-off literal values rather than
// design-system tokens, because the rest of the app has no dark surfaces and
// these colours only make sense in this dark context.
const SIDEBAR_BG     = "#1C1C1E"   /* v3: Apple's iOS "system gray 6 dark" — same intent as the previous #18181B, just the real Apple near-black rather than Tailwind's zinc-900 */
const SIDEBAR_BORDER = "rgba(255, 255, 255, 0.08)"
const SIDEBAR_TEXT   = "#A1A1AA"
const SIDEBAR_TEXT_ACTIVE = "#FFFFFF"
const SIDEBAR_TINT_ACTIVE = "rgba(70, 64, 222, 0.18)"   // ac at low opacity
const SIDEBAR_AVATAR_BG   = "#2A2A2E"

function UserPanel() {
  const { user, role, logout } = useUser()
  const { theme, toggle } = useTheme()

  const handleLogout = async () => {
    await logout()
    window.location.href = "/login"
  }

  return (
    <div className="px-3 py-3 shrink-0" style={{ padding: "12px", borderTop: `1px solid ${SIDEBAR_BORDER}` }}>
      <div className="flex items-center gap-2 px-1">
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
          style={{ width: "24px", height: "24px", borderRadius: "9999px", backgroundColor: SIDEBAR_AVATAR_BG, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <ShieldCheck className="h-3.5 w-3.5" style={{ color: role === "ADMIN" ? "#7F77DD" : SIDEBAR_TEXT }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate" style={{ color: SIDEBAR_TEXT_ACTIVE, fontWeight: 600 }}>{user?.name ?? "—"}</p>
          <p className="text-[10px]" style={{ color: SIDEBAR_TEXT }}>{role === "ADMIN" ? "Admin" : "Engineer"}</p>
        </div>
        <button
          onClick={toggle}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: SIDEBAR_TEXT, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "6px", flexShrink: 0 }}
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={handleLogout}
          className="text-[11px] shrink-0"
          style={{ color: SIDEBAR_TEXT, textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          Log out
        </button>
      </div>
    </div>
  )
}

export function SideNav() {
  const path = usePathname()
  const { role } = useUser()
  const nav = modulesForRole(role)

  return (
    <aside
      className={cn(
        "w-52 shrink-0 flex flex-col h-full",
        // z-10 keeps sidebar below modal backdrop (z-[100])
        // isolate prevents any child from escaping this stacking context
        "relative z-10 isolate",
      )}
      style={{
        width: "208px",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: SIDEBAR_BG,
        borderRight: `1px solid ${SIDEBAR_BORDER}`,
        position: "relative",
        zIndex: 10,
        isolation: "isolate",
      }}
    >
      {/* Logo */}
      <div
        className="px-4 flex items-center justify-center shrink-0"
        style={{ padding: "20px 16px", display: "flex", alignItems: "center", justifyContent: "center", borderBottom: `1px solid ${SIDEBAR_BORDER}`, flexShrink: 0 }}
      >
        <Image
          src="/branding/LOGO2025.jpg"
          alt="Oryx Design"
          width={180}
          height={180}
          className="shrink-0"
          style={{ width: "100%", maxWidth: "160px", height: "auto", objectFit: "contain", flexShrink: 0 }}
          priority
        />
      </div>

      {/* Navigation — filtered to modules the current role can access (lib/permissions.ts) */}
      <nav className="flex-1 px-2 py-3 space-y-px" style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: "2px" }}>
        {nav.map(({ key, href, label }) => {
          const Icon = ICONS[key] ?? FolderOpen
          const active = ACTIVE_PREFIX[key] ? path.startsWith(href) : path === href
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 px-3 py-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ac focus-visible:ring-inset"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "9px 12px 9px 9px",
                borderRadius: "8px",
                borderLeft: active ? "3px solid #4640DE" : "3px solid transparent",
                fontSize: "13px",
                fontWeight: active ? 600 : 500,
                textDecoration: "none",
                backgroundColor: active ? SIDEBAR_TINT_ACTIVE : "transparent",
                color: active ? SIDEBAR_TEXT_ACTIVE : SIDEBAR_TEXT,
              }}
            >
              <Icon
                className="h-4 w-4 shrink-0"
                style={{ width: "16px", height: "16px", flexShrink: 0, color: active ? "#7F77DD" : SIDEBAR_TEXT }}
              />
              {label}
            </Link>
          )
        })}
      </nav>

      <UserPanel />

      {/* Footer */}
      <div
        className="px-4 py-3 shrink-0"
        style={{ padding: "12px 16px", borderTop: `1px solid ${SIDEBAR_BORDER}`, flexShrink: 0 }}
      >
        <p style={{ fontSize: "11px", color: SIDEBAR_TEXT }}>Oryx Design Ltd · 2026</p>
      </div>
    </aside>
  )
}
