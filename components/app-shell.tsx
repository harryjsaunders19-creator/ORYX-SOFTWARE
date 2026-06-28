"use client"
import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"
import { useUser } from "@/components/user-context"
import { SideNav } from "@/components/side-nav"
import { AppTopBar, APP_SIDEBAR_W, APP_TOP_BAR_H } from "@/components/app-top-bar"
import { AppShellSkeleton } from "@/components/app-shell-skeleton"

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, mustChangePassword } = useUser()
  const pathname = usePathname()
  const router   = useRouter()

  const isAuthPage = pathname === "/login" || pathname === "/set-password"

  useEffect(() => {
    if (loading) return
    if (!user && !isAuthPage) {
      router.replace("/login")
    }
    if (user && mustChangePassword && pathname !== "/set-password") {
      router.replace("/set-password")
    }
  }, [user, loading, mustChangePassword, isAuthPage, pathname, router])

  if (isAuthPage) {
    return <>{children}</>
  }

  if (loading) return <AppShellSkeleton />
  if (!user) return <AppShellSkeleton />
  if (mustChangePassword) return <AppShellSkeleton />

  return (
    <div className="min-h-screen bg-pg">
      <SideNav />
      <AppTopBar />
      <main
        className="min-h-screen overflow-y-auto thin-scroll bg-pg"
        style={{
          marginLeft: APP_SIDEBAR_W,
          paddingTop: APP_TOP_BAR_H,
        }}
      >
        {children}
      </main>
    </div>
  )
}
