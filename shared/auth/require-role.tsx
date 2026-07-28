"use client"
import { ShieldAlert } from "lucide-react"
import Link from "next/link"
import { useUser } from "@/shared/providers/user-context"
import type { Role } from "@/shared/types/role"

/**
 * Wraps an Admin-only (or otherwise role-restricted) page. This is a UI
 * convenience, not the security boundary — every API route this page calls
 * already enforces the same restriction server-side via lib/auth.ts's
 * requireRole(), so even if this guard were bypassed, no restricted data
 * would actually load. This just avoids showing a half-broken page full of
 * failed requests to someone who can't use it.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { role, loading } = useUser()

  // Perf: keep layout painted while session loads (route loading.tsx covers body).
  if (loading) {
    return (
      <div className="px-6 py-10 space-y-3" aria-busy="true" aria-label="Loading">
        <div className="skeleton h-8 w-48 rounded" />
        <div className="skeleton h-4 w-72 rounded" />
        <div className="skeleton h-32 w-full rounded" />
      </div>
    )
  }
  if (!roles.includes(role)) {
    return (
      <div className="px-6 py-16 flex flex-col items-center text-center">
        <ShieldAlert className="h-5 w-5 text-t4 mb-3" />
        <p className="text-sm font-medium text-t1 mb-1">You don&rsquo;t have access to this page</p>
        <p className="text-xs text-t3 mb-4">This area is restricted to Admins.</p>
        <Link href="/" className="text-sm text-ac hover:text-ach font-medium">Back to dashboard</Link>
      </div>
    )
  }
  return <>{children}</>
}
