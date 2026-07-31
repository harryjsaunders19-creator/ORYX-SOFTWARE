"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useUser } from "@/shared/providers/user-context"
import { StitchSideNav, SIDEBAR_COLLAPSE_KEY } from "@/shared/layouts/stitch-side-nav"
import { StitchTopBar } from "@/shared/layouts/stitch-top-bar"
import { moduleKeyForPath } from "@/shared/layouts/nav-utils"
import { STITCH_SIDEBAR_COLLAPSED_W, STITCH_SIDEBAR_W } from "@/shared/branding/stitch-layout"

function applySidebarWidth(collapsed: boolean) {
  if (typeof document === "undefined") return
  document.documentElement.style.setProperty(
    "--stitch-sidebar-w",
    `${collapsed ? STITCH_SIDEBAR_COLLAPSED_W : STITCH_SIDEBAR_W}px`,
  )
  document.documentElement.dataset.sidebarCollapsed = collapsed ? "true" : "false"
}

export function StitchAppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, mustChangePassword, canAccess } = useUser()
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const isAuthPage = pathname === "/login" || pathname === "/set-password"

  useEffect(() => {
    try {
      const collapsed = localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1"
      setSidebarCollapsed(collapsed)
      applySidebarWidth(collapsed)
    } catch {
      applySidebarWidth(false)
    }
  }, [])

  const handleCollapsedChange = useCallback((collapsed: boolean) => {
    setSidebarCollapsed(collapsed)
    applySidebarWidth(collapsed)
  }, [])

  useEffect(() => {
    if (loading) return
    if (!user && !isAuthPage) router.replace("/login")
    if (user && mustChangePassword && pathname !== "/set-password") router.replace("/set-password")
    if (user) {
      const moduleKey = moduleKeyForPath(pathname)
      if (moduleKey && !canAccess(moduleKey)) router.replace("/")
    }
  }, [user, loading, mustChangePassword, isAuthPage, pathname, canAccess, router])

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!sidebarOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [sidebarOpen])

  if (isAuthPage) return <>{children}</>

  if (!loading && !user) return null
  if (!loading && mustChangePassword && pathname !== "/set-password") return null

  return (
    <div className="min-h-screen bg-s0 text-t1">
      <StitchSideNav
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onCollapsedChange={handleCollapsedChange}
      />
      <StitchTopBar onMenuClick={() => setSidebarOpen(true)} />
      <main className="oryx-app-main overflow-y-auto thin-scroll bg-s0">
        {children}
      </main>
    </div>
  )
}
