"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useUser } from "@/shared/providers/user-context"
import { StitchSideNav } from "@/shared/layouts/stitch-side-nav"
import { StitchTopBar } from "@/shared/layouts/stitch-top-bar"
import { MobileBottomNav } from "@/shared/layouts/mobile-bottom-nav"

export function StitchAppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, mustChangePassword } = useUser()
  const pathname = usePathname()
  const router = useRouter()

  const isAuthPage = pathname === "/login" || pathname === "/set-password"

  useEffect(() => {
    if (loading) return
    if (!user && !isAuthPage) router.replace("/login")
    if (user && mustChangePassword && pathname !== "/set-password") router.replace("/set-password")
  }, [user, loading, mustChangePassword, isAuthPage, pathname, router])

  if (isAuthPage) return <>{children}</>

  if (!loading && !user) return null
  if (!loading && mustChangePassword && pathname !== "/set-password") return null

  return (
    <div className="min-h-screen overflow-x-hidden bg-pg text-t1">
      <StitchSideNav />
      <StitchTopBar />
      <MobileBottomNav />
      <main
        className="min-h-screen overflow-x-hidden overflow-y-auto thin-scroll bg-pg pt-16 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] lg:ml-64 lg:pb-0"
      >
        {children}
      </main>
    </div>
  )
}
