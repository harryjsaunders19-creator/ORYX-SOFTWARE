"use client"

import { createElement, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  CircleHelp,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from "lucide-react"
import { cn } from "@/shared/utils"
import { useUser } from "@/shared/providers/user-context"
import { modulesForUser, type ModuleDef } from "@/shared/auth/permissions"
import { OryxLogo } from "@/shared/branding/oryx-logo"
import { STITCH_SIDEBAR_COLLAPSED_W, STITCH_SIDEBAR_W } from "@/shared/branding/stitch-layout"
import { isNavItemActive } from "@/shared/layouts/nav-utils"
import { navIcon } from "@/shared/layouts/nav-icons"
import { NAV_GROUPS } from "@/shared/layouts/nav-groups"

const SIDEBAR_COLLAPSE_KEY = "oryx-sidebar-collapsed"

/** Command Centre primary order — remaining modules follow group order. */
const PRIMARY_NAV_KEYS = [
  "dashboard",
  "jobs",
  "clients",
  "performance",
  "billing",
  "quotes",
  "calendar",
  "employees",
  "job-map",
  "site-visit-calculator",
  "hold-list",
  "password-vault",
  "users",
  "backups",
  "health",
] as const

const FOOTER_NAV_KEYS = new Set(["archived", "health"])

type NavLinkProps = {
  item: ModuleDef
  active: boolean
  collapsed: boolean
  onNavigate?: () => void
  compact?: boolean
}

function NavLink({ item, active, collapsed, onNavigate, compact }: NavLinkProps) {
  const Icon = navIcon(item.key)
  return (
    <Link
      href={item.href}
      data-active={active ? "true" : "false"}
      onClick={() => onNavigate?.()}
      title={collapsed ? item.label : undefined}
      className={cn(
        "stitch-nav-link group flex items-center gap-3 rounded-lg transition-colors duration-200 outline-none",
        "focus-visible:ring-2 focus-visible:ring-[color:var(--stitch-sidebar-text)]/25 focus-visible:ring-inset",
        compact ? "px-4 py-2" : "px-4 py-3",
        collapsed ? "justify-center mx-2 px-0" : "mx-0",
      )}
    >
      {createElement(Icon, {
        className: "h-5 w-5 shrink-0",
        strokeWidth: active ? 2.25 : 1.75,
        "aria-hidden": true,
      })}
      {!collapsed && <span className="type-nav truncate">{item.label}</span>}
      {collapsed && <span className="sr-only">{item.label}</span>}
    </Link>
  )
}

function orderedNavItems(nav: ModuleDef[]): ModuleDef[] {
  const byKey = new Map(nav.map(m => [m.key, m]))
  const primary = PRIMARY_NAV_KEYS
    .map(k => byKey.get(k))
    .filter((m): m is ModuleDef => !!m && !FOOTER_NAV_KEYS.has(m.key))

  const seen = new Set(primary.map(m => m.key))
  const rest = NAV_GROUPS
    .flatMap(g => g.keys)
    .map(k => byKey.get(k))
    .filter((m): m is ModuleDef => !!m && !seen.has(m.key) && !FOOTER_NAV_KEYS.has(m.key))

  const orphans = nav.filter(m => !seen.has(m.key) && !FOOTER_NAV_KEYS.has(m.key) && !rest.includes(m))
  return [...primary, ...rest, ...orphans]
}

type SideNavContentProps = {
  onNavigate?: () => void
  collapsed: boolean
  onToggleCollapse?: () => void
  showCollapseToggle?: boolean
}

function SideNavContent({
  onNavigate,
  collapsed,
  onToggleCollapse,
  showCollapseToggle = false,
}: SideNavContentProps) {
  const path = usePathname()
  const { role, loading, user, canAccess } = useUser()
  const nav = modulesForUser(role, user?.moduleAccess ?? null)
  const items = orderedNavItems(nav)
  const archived = nav.find(m => m.key === "archived")
  const isActive = (key: string, href: string) => isNavItemActive(path, key, href)
  const canCreateJob = canAccess("jobs")

  return (
    <>
      <div className={cn(collapsed ? "px-2 pt-2" : "px-6 pt-4")}>
        <Link
          href="/"
          className={cn(
            "mb-8 block transition-opacity hover:opacity-90",
            collapsed && "flex justify-center",
          )}
          onClick={() => onNavigate?.()}
          aria-label="ORYX OS — home"
        >
          {collapsed ? (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-md text-sm font-semibold tracking-tight"
              style={{
                backgroundColor: "var(--stitch-sidebar-active)",
                color: "var(--stitch-sidebar-active-text, #fff)",
              }}
            >
              O
            </div>
          ) : (
            <>
              <OryxLogo variant="menu" className="mb-3 max-w-[160px]" />
              <h1 className="stitch-sidebar-brand-title type-section-heading">
                ORYX OS
              </h1>
            </>
          )}
        </Link>
      </div>

      <nav
        className={cn(
          "flex-1 space-y-1 overflow-y-auto thin-scroll pb-4",
          collapsed ? "px-0" : "px-3",
        )}
        aria-busy={loading}
      >
        {loading ? (
          [...Array(6)].map((_, i) => (
            <div
              key={i}
              className={cn(
                "my-1 h-11 animate-pulse rounded-lg",
                collapsed ? "mx-2" : "mx-0",
              )}
              style={{ backgroundColor: "color-mix(in srgb, var(--stitch-sidebar-text) 8%, transparent)" }}
            />
          ))
        ) : (
          items.map(item => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(item.key, item.href)}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))
        )}
      </nav>

      <div className={cn("mt-auto space-y-4", collapsed ? "px-2 pb-2" : "px-6 pb-4")}>
        {canCreateJob && (
          <Link
            href="/jobs?new=1"
            onClick={() => onNavigate?.()}
            title={collapsed ? "New Project" : undefined}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium transition-opacity hover:opacity-90",
              collapsed && "px-0",
            )}
            style={{
              backgroundColor: "var(--stitch-sidebar-active)",
              color: "var(--stitch-sidebar-active-text, #fff)",
            }}
          >
            <Plus className="h-5 w-5 shrink-0" aria-hidden />
            {!collapsed && <span>New Project</span>}
            {collapsed && <span className="sr-only">New Project</span>}
          </Link>
        )}

        <div className="space-y-1 border-t border-[color:var(--stitch-sidebar-border)] pt-4">
          <a
            href="https://www.oryxdesignltd.co.uk/"
            target="_blank"
            rel="noopener noreferrer"
            title={collapsed ? "Support" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-4 py-2 text-[color:var(--stitch-sidebar-text-muted)] transition-colors hover:bg-[color:var(--stitch-sidebar-hover)]",
              collapsed && "justify-center px-0",
            )}
          >
            <CircleHelp className="h-5 w-5 shrink-0" aria-hidden />
            {!collapsed && <span className="text-sm font-medium">Support</span>}
            {collapsed && <span className="sr-only">Support</span>}
          </a>
          {archived && (
            <NavLink
              item={{ ...archived, label: "Archive" }}
              active={isActive(archived.key, archived.href)}
              collapsed={collapsed}
              onNavigate={onNavigate}
              compact
            />
          )}
        </div>

        {showCollapseToggle && onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg py-2 text-sm text-[color:var(--stitch-sidebar-text-muted)] transition-colors hover:bg-[color:var(--stitch-sidebar-hover)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--stitch-sidebar-text)]/25",
              collapsed ? "justify-center px-0" : "px-4",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <>
                <PanelLeftClose className="h-5 w-5 shrink-0" />
                <span>Collapse</span>
              </>
            )}
          </button>
        )}
      </div>
    </>
  )
}

const sidebarClass =
  "stitch-sidebar fixed left-0 top-0 bottom-0 z-50 flex flex-col transition-[width] duration-200 ease-out"

type Props = {
  mobileOpen?: boolean
  onMobileClose?: () => void
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}

export function StitchSideNav({
  mobileOpen = false,
  onMobileClose = () => {},
  collapsed: collapsedProp,
  onCollapsedChange,
}: Props) {
  const [internalCollapsed, setInternalCollapsed] = useState(false)
  const controlled = typeof collapsedProp === "boolean"
  const collapsed = controlled ? collapsedProp! : internalCollapsed

  useEffect(() => {
    if (controlled) return
    try {
      setInternalCollapsed(localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1")
    } catch {
      /* ignore */
    }
  }, [controlled])

  const setCollapsed = useCallback((next: boolean) => {
    if (!controlled) setInternalCollapsed(next)
    onCollapsedChange?.(next)
    try {
      localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? "1" : "0")
    } catch {
      /* ignore */
    }
  }, [controlled, onCollapsedChange])

  const width = collapsed ? STITCH_SIDEBAR_COLLAPSED_W : STITCH_SIDEBAR_W

  return (
    <>
      {/* Desktop */}
      <aside
        id="oryx-stitch-sidebar"
        className={cn(sidebarClass)}
        style={{ width }}
        data-collapsed={collapsed ? "true" : "false"}
      >
        <SideNavContent
          collapsed={collapsed}
          showCollapseToggle
          onToggleCollapse={() => setCollapsed(!collapsed)}
        />
      </aside>

      {/* Mobile drawer — always expanded labels */}
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
          <SideNavContent collapsed={false} onNavigate={onMobileClose} />
        </aside>
      </div>
    </>
  )
}

export { SIDEBAR_COLLAPSE_KEY }
