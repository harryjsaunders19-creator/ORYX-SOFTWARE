"use client"
import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"
import { useUser } from "@/components/user-context"
import { SideNav } from "@/components/side-nav"

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

  // Auth pages — render without app shell
  if (isAuthPage) {
    return <>{children}</>
  }

  if (loading) return null
  if (!user) return null
  if (mustChangePassword) return null

  return (
    <div
      className="flex h-screen overflow-hidden bg-pg"
      style={{ display: "flex", height: "100vh", overflow: "hidden", backgroundColor: "var(--color-pg)" }}
    >
      <SideNav />
      <main
        className="relative z-0 isolate flex-1 overflow-y-auto thin-scroll bg-pg"
        style={{ position: "relative", zIndex: 0, isolation: "isolate", flex: 1, overflowY: "auto", backgroundColor: "var(--color-pg)" }}
      >
        <div
          className="max-w-[1400px] mx-auto"
          style={{ maxWidth: "1400px", margin: "0 auto" }}
        >
          {children}
        </div>
      </main>
    </div>
  )
}
