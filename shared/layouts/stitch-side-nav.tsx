"use client"

import { createElement, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { cn } from "@/shared/utils"
import { Typography } from "@/shared/design/typography"
import { useUser } from "@/shared/providers/user-context"
import { modulesForUser, type ModuleDef } from "@/shared/auth/permissions"
import { OryxLogo } from "@/shared/branding/oryx-logo"
import { STITCH_SIDEBAR_COLLAPSED_W, STITCH_SIDEBAR_W } from "@/shared/branding/stitch-layout"
import { isNavItemActive } from "@/shared/layouts/nav-utils"
import { navIcon } from "@/shared/layouts/nav-icons"
import { NAV_GROUPS } from "@/shared/layouts/nav-groups"

const SIDEBAR_COLLAPSE_KEY = "oryx-sidebar-collapsed"

type NavLinkProps = {
  item: ModuleDef
  active: boolean
  collapsed: boolean
  onNavigate?: () => void
}

function NavLink({ item, active, collapsed, onNavigate }: NavLinkProps) {
  const Icon = navIcon(item.key)
  return (
    <Link
      href={item.href}
      data-active={active ? "true" : "false"}
      onClick={() => onNavigate?.()}
      title={collapsed ? item.label : undefined}
      className={cn(
        Typography.Nav,
        "stitch-nav-link group flex items-center gap-3 rounded-md transition-colors duration-150 ease-in-out outline-none",
        "focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-inset",
        collapsed ? "justify-center px-0 py-2.5 mx-2" : "mx-2 px-3 py-2.5",
      )}
    >
      {createElement(Icon, {
        className: "h-5 w-5 shrink-0 opacity-80 group-data-[active=true]:opacity-100",
        strokeWidth: active ? 2.25 : 1.75,
        "aria-hidden": true,
      })}
      {!collapsed && <span className="truncate">{item.label}</span>}
      {collapsed && <span className="sr-only">{item.label}</span>}
    </Link>
  )
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
  const { role, loading, user } = useUser()
  const nav = modulesForUser(role, user?.moduleAccess ?? null)
  const byKey = new Map(nav.map(m => [m.key, m]))
  const isActive = (key: string, href: string) => isNavItemActive(path, key, href)

  const grouped = NAV_GROUPS
    .map(group => ({
      id: group.id,
      label: group.label,
      items: group.keys.map(k => byKey.get(k)).filter((m): m is ModuleDef => !!m),
    }))
    .filter(g => g.items.length > 0)

  const groupedKeys = new Set<string>(NAV_GROUPS.flatMap(g => [...g.keys]))
  const orphanItems = nav.filter(m => !groupedKeys.has(m.key))
  const sections = orphanItems.length
    ? [...grouped, { id: "more", label: "More", items: orphanItems }]
    : grouped

  return (
    <>
      <div className={cn("mb-4", collapsed ? "px-2" : "px-4")}>
        <Link
          href="/"
          className="block transition-opacity hover:opacity-90"
          onClick={() => onNavigate?.()}
          aria-label="Oryx Scaffold Design — home"
        >
          {collapsed ? (
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-white/10">
              <span className="text-sm font-semibold tracking-tight text-white">O</span>
            </div>
          ) : (
            <>
              <OryxLogo variant="menu" className="mb-2" />
              <p className="stitch-sidebar-brand-sub">
                {loading ? "\u00a0" : role === "ADMIN" ? "Internal admin" : "Engineer terminal"}
              </p>
            </>
          )}
        </Link>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto thin-scroll px-0 pb-4" aria-busy={loading}>
        {loading ? (
          [...Array(6)].map((_, i) => (
            <div key={i} className={cn("my-2 h-9 animate-pulse rounded-md bg-white/10", collapsed ? "mx-2" : "mx-4")} />
          ))
        ) : (
          sections.map(group => (
            <div key={group.id} className="space-y-1">
              {!collapsed && (
                <p className="stitch-nav-section-label px-5 pb-1">
                  {group.label}
                </p>
              )}
              {collapsed && <div className="mx-4 my-1 h-px bg-white/10" aria-hidden />}
              {group.items.map(item => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(item.key, item.href)}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          ))
        )}
      </nav>

      {showCollapseToggle && onToggleCollapse && (
        <div className={cn("mt-auto border-t border-white/10 pt-3", collapsed ? "px-2" : "px-3")}>
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
                Typography.Nav,
                "flex w-full items-center gap-3 rounded-md py-2.5 text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
              collapsed ? "justify-center px-0" : "px-3",
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
        </div>
      )}
    </>
  )
}

const sidebarClass = "stitch-sidebar fixed left-0 top-0 bottom-0 z-50 flex flex-col py-4 transition-[width] duration-200 ease-out"

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
