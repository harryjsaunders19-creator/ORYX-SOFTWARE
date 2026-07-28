"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useUser } from "@/shared/providers/user-context"
import { StitchSideNav } from "@/shared/layouts/stitch-side-nav"
import { StitchTopBar } from "@/shared/layouts/stitch-top-bar"
import { moduleKeyForPath } from "@/shared/layouts/nav-utils"

export function StitchAppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, mustChangePassword, canAccess } = useUser()
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isAuthPage = pathname === "/login" || pathname === "/set-password"

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
    <div className="min-h-screen bg-pg text-t1">
      <StitchSideNav
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />
      <StitchTopBar onMenuClick={() => setSidebarOpen(true)} />
      <main className="oryx-app-main overflow-y-auto thin-scroll bg-pg">
        {children}
      </main>
    </div>
  )
}
