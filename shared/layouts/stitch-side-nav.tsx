"use client"

import { createElement } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/shared/utils"
import { useUser } from "@/shared/providers/user-context"
import { modulesForUser, type ModuleDef } from "@/shared/auth/permissions"
import { OryxLogo } from "@/shared/branding/oryx-logo"
import { STITCH_SIDEBAR_W } from "@/shared/branding/stitch-layout"
import { isNavItemActive } from "@/shared/layouts/nav-utils"
import { navIcon } from "@/shared/layouts/nav-icons"

const ADMIN_KEYS = new Set(["job-map", "billing", "performance", "archived", "users", "backups", "health"])

type NavLinkProps = {
  item: ModuleDef
  active: boolean
  onNavigate?: () => void
}

function NavLink({ item, active, onNavigate }: NavLinkProps) {
  return (
    <Link
      href={item.href}
      data-active={active ? "true" : "false"}
      onClick={() => onNavigate?.()}
      className={cn(
        "stitch-nav-link flex items-center gap-3 px-4 py-3 text-sm transition-all duration-150 ease-in-out outline-none",
        "focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-inset -ml-px pl-[15px]",
      )}
    >
      {createElement(navIcon(item.key), {
        className: "h-5 w-5 shrink-0",
        strokeWidth: active ? 2.25 : 2,
      })}
      {item.label}
    </Link>
  )
}

type SideNavContentProps = {
  onNavigate?: () => void
}

function SideNavContent({ onNavigate }: SideNavContentProps) {
  const path = usePathname()
  const { role, loading, user } = useUser()
  const nav = modulesForUser(role, user?.moduleAccess ?? null)
  const mainNav = nav.filter(m => !ADMIN_KEYS.has(m.key))
  const adminNav = nav.filter(m => ADMIN_KEYS.has(m.key))
  const isActive = (key: string, href: string) => isNavItemActive(path, key, href)

  return (
    <>
      <div className="mb-6 px-4">
        <Link href="/" className="block transition-opacity hover:opacity-90" onClick={() => onNavigate?.()} aria-label="Oryx Scaffold Design — home">
          <OryxLogo variant="menu" className="mb-2" />
          <p className="stitch-sidebar-brand-sub">
            {/* Perf: avoid flashing "Engineer Terminal" for admins while session loads. */}
            {loading ? "\u00a0" : role === "ADMIN" ? "Internal Admin" : "Engineer Terminal"}
          </p>
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto thin-scroll" aria-busy={loading}>
        {loading ? (
          // Perf: skeletal nav while session resolves — no wrong-role link flash.
          [...Array(6)].map((_, i) => (
            <div key={i} className="mx-4 my-2 h-9 rounded bg-white/10 animate-pulse" />
          ))
        ) : (
          <>
            {mainNav.map(item => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(item.key, item.href)}
                onNavigate={onNavigate}
              />
            ))}

            {adminNav.length > 0 && (
              <div
                className="mt-2 space-y-0.5 border-t pt-2"
                style={{ borderColor: "rgba(255, 255, 255, 0.1)" }}
              >
                {adminNav.map(item => (
                  <NavLink
                    key={item.href}
                    item={item}
                    active={isActive(item.key, item.href)}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </nav>
    </>
  )
}

const sidebarClass = "stitch-sidebar fixed left-0 top-0 bottom-0 z-50 flex w-64 flex-col py-4"

type Props = {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function StitchSideNav({ mobileOpen = false, onMobileClose = () => {} }: Props) {
  return (
    <>
      {/* Desktop — always visible at md+ */}
      <aside
        id="oryx-stitch-sidebar"
        className={cn(sidebarClass)}
        style={{ width: STITCH_SIDEBAR_W }}
      >
        <SideNavContent />
      </aside>

      {/* Mobile — slide-in drawer */}
      <div className="oryx-mobile-nav-drawer" aria-hidden={!mobileOpen}>
        <button
          type="button"
          aria-label="Close navigation menu"
          className={cn(
            "fixed inset-0 z-[60] bg-black/50 transition-opacity duration-300",
            mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onClick={onMobileClose}
          tabIndex={mobileOpen ? 0 : -1}
        />
        <aside
          id="oryx-stitch-sidebar-mobile"
          className={cn(
            sidebarClass,
            "z-[70] transition-transform duration-300 ease-in-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full pointer-events-none",
          )}
          style={{ width: STITCH_SIDEBAR_W }}
          aria-hidden={!mobileOpen}
        >
          <SideNavContent onNavigate={onMobileClose} />
        </aside>
      </div>
    </>
  )
}
