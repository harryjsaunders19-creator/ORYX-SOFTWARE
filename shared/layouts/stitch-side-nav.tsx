"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/shared/utils"
import { useUser } from "@/shared/providers/user-context"
import { modulesForRole, type ModuleDef } from "@/shared/auth/permissions"
import { OryxLogo } from "@/shared/branding/oryx-logo"
import { STITCH_SIDEBAR_W } from "@/shared/branding/stitch-layout"
import { isNavItemActive } from "@/shared/layouts/nav-utils"
import { navIcon } from "@/shared/layouts/nav-icons"

const ADMIN_KEYS = new Set(["billing", "archived", "users", "backups", "health"])

function NavLink({ item, active }: { item: ModuleDef; active: boolean }) {
  const Icon = navIcon(item.key)
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

  const isActive = (key: string, href: string) => isNavItemActive(path, key, href)

  return (
    <aside
      id="oryx-stitch-sidebar"
      className="stitch-sidebar fixed left-0 top-0 bottom-0 z-50 hidden flex-col py-4 lg:flex"
      style={{ width: STITCH_SIDEBAR_W }}
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
