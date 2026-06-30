"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useUser } from "@/components/user-context"
import { StitchSideNav } from "@/components/stitch-layout/side-nav"
import { StitchTopBar } from "@/components/stitch-layout/top-bar"
import { StitchAppShellSkeleton } from "@/components/stitch-layout/skeleton"
import { STITCH_SIDEBAR_W, STITCH_TOP_BAR_H, STITCH_CANVAS_BG } from "@/lib/stitch-layout"

export function StitchAppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, mustChangePassword } = useUser()
  const pathname = usePathname()
  const router = useRouter()

  const isAuthPage = pathname === "/login" || pathname === "/set-password"

  /* Keep light mode — stitch-layout class is on <html> from app/layout.tsx */
  useEffect(() => {
    document.documentElement.classList.remove("dark")
  }, [])

  useEffect(() => {
    if (loading) return
    if (!user && !isAuthPage) router.replace("/login")
    if (user && mustChangePassword && pathname !== "/set-password") router.replace("/set-password")
  }, [user, loading, mustChangePassword, isAuthPage, pathname, router])

  if (isAuthPage) return <>{children}</>

  if (loading || !user || mustChangePassword) return <StitchAppShellSkeleton />

  return (
    <div className="min-h-screen text-t1" style={{ backgroundColor: STITCH_CANVAS_BG }}>
      <StitchSideNav />
      <StitchTopBar />
      <main
        className="min-h-screen overflow-y-auto thin-scroll"
        style={{
          marginLeft: STITCH_SIDEBAR_W,
          paddingTop: STITCH_TOP_BAR_H,
          backgroundColor: STITCH_CANVAS_BG,
        }}
      >
        {children}
      </main>
    </div>
  )
}

