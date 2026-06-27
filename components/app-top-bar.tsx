"use client"
import { useState, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { Search, Plus } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useUser } from "@/components/user-context"
import { NotificationsMenu } from "@/components/notifications-menu"
import { cn } from "@/lib/utils"

const SIDEBAR_W = 260
const BAR_H = 72

export const APP_TOP_BAR_H = BAR_H
export const APP_SIDEBAR_W = SIDEBAR_W

export function AppTopBar() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, role } = useUser()
  const [query, setQuery] = useState("")

  const onSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    if (pathname.startsWith("/clients")) {
      router.push(`/clients?search=${encodeURIComponent(q)}`)
    } else if (pathname.startsWith("/quotes")) {
      router.push(`/quotes?search=${encodeURIComponent(q)}`)
    } else {
      router.push(`/jobs?search=${encodeURIComponent(q)}`)
    }
  }, [query, pathname, router])

  const initials = user?.name
    ?.split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join("") ?? "?"

  return (
    <header
      className="fixed top-0 right-0 z-30 flex items-center gap-4 px-6 border-b border-bd bg-sr/95 backdrop-blur-md"
      style={{ left: SIDEBAR_W, height: BAR_H }}
    >
      <form onSubmit={onSearch} className="relative flex-1 max-w-lg">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-t4 pointer-events-none" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search jobs, clients, drawing numbers…"
          className="h-11 pl-11 bg-surface-low border-none shadow-none rounded-full focus-visible:ring-2 focus-visible:ring-ac/25"
        />
      </form>

      <div className="flex items-center gap-2 shrink-0">
        <Button variant="primary" size="sm" className="rounded-full px-4 hidden sm:inline-flex" asChild>
          <Link href="/jobs">
            <Plus className="h-3.5 w-3.5" />
            New job
          </Link>
        </Button>

        <NotificationsMenu />

        <div
          className={cn(
            "flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-full border border-bd bg-pg",
            "max-w-[200px]",
          )}
        >
          <div className="w-8 h-8 rounded-full bg-ac text-white text-xs font-bold flex items-center justify-center shrink-0">
            {initials}
          </div>
          <div className="min-w-0 hidden md:block">
            <p className="text-xs font-semibold text-t1 truncate leading-tight">{user?.name ?? "—"}</p>
            <p className="text-[10px] text-t4 leading-tight">{role === "ADMIN" ? "Admin" : "Engineer"}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
