"use client"

import { createContext, useCallback, useContext, useMemo } from "react"
import type { User } from "@/lib/types"
import type { Role } from "@/shared/types/role"
import { canAccessModule as canAccessModuleFn } from "@/shared/auth/permissions"
import { useApi } from "@/shared/hooks/use-api"

interface UserCtx {
  user: User | null
  userName: string
  role: Role
  isAdmin: boolean
  loading: boolean
  mustChangePassword: boolean
  isImpersonating: boolean
  realUser: { id: string; name: string } | null
  /** Switches the active identity via /api/auth/switch. Throws with the
   *  server's error message if the switch is rejected (e.g. a non-admin
   *  trying to switch away from themselves) — callers should catch this
   *  and show it, not assume every call succeeds. */
  switchUser: (userId: string) => Promise<void>
  /** Returns to the real identity without needing to know its id. */
  exitImpersonation: () => Promise<void>
  logout: () => Promise<void>
  canAccess: (moduleKey: string) => boolean
}

const Ctx = createContext<UserCtx>({
  user: null, userName: "System", role: "ENGINEER", isAdmin: false, loading: true,
  mustChangePassword: false, isImpersonating: false, realUser: null,
  switchUser: async () => {}, exitImpersonation: async () => {}, logout: async () => {}, canAccess: () => true,
})
export const useUser = () => useContext(Ctx)

interface SessionResponse {
  user: User | null
  mustChangePassword?: boolean
  isImpersonating: boolean
  realUser: { id: string; name: string } | null
}

const EMPTY_SESSION: SessionResponse = {
  user: null,
  mustChangePassword: false,
  isImpersonating: false,
  realUser: null,
}

export function UserProvider({
  children,
  fallbackSession,
}: {
  children: React.ReactNode
  /** RSC-seeded session — paints shell without waiting on /api/auth/session. */
  fallbackSession?: SessionResponse | null
}) {
  // Perf: SWR-backed session so shell/pages share one in-flight fetch and
  // can update identity without remounting providers. Shell already paints
  // children while loading (see StitchAppShell).
  const { data, isLoading, mutate } = useApi<SessionResponse>("/api/auth/session", {
    fallbackData: fallbackSession ?? undefined,
  })

  const session = data ?? fallbackSession ?? EMPTY_SESSION
  const user = session.user
  const mustChangePassword = session.mustChangePassword ?? false
  const isImpersonating = session.isImpersonating
  const realUser = session.realUser

  const applySession = useCallback(
    (d: SessionResponse) => {
      void mutate(
        {
          user: d.user,
          mustChangePassword: d.mustChangePassword ?? false,
          isImpersonating: d.isImpersonating,
          realUser: d.realUser,
        },
        { revalidate: false },
      )
    },
    [mutate],
  )

  const switchUser = useCallback(async (userId: string) => {
    const res = await fetch("/api/auth/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
    const d = await res.json() as SessionResponse & { error?: string }
    if (!res.ok) throw new Error(d.error ?? "Could not switch identity")
    applySession(d)
  }, [applySession])

  const exitImpersonation = useCallback(async () => {
    const res = await fetch("/api/auth/exit-impersonation", { method: "POST" })
    const d = await res.json() as SessionResponse & { error?: string }
    if (!res.ok) throw new Error(d.error ?? "Could not exit impersonation")
    applySession(d)
  }, [applySession])

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    applySession(EMPTY_SESSION)
    // Callers that need a redirect (e.g. sidebar logout button) do
    // window.location.href = "/login" themselves after awaiting this.
  }, [applySession])

  const role = user?.role ?? "ENGINEER" // fail closed — see lib/auth.ts getCurrentRole()
  const isAdmin = role === "ADMIN"

  const canAccess = useCallback(
    (moduleKey: string) => canAccessModuleFn(role, moduleKey),
    [role],
  )

  // With RSC fallback, treat as loaded once we have seeded or fetched data.
  const loading = isLoading && data === undefined && fallbackSession == null

  const value = useMemo<UserCtx>(() => ({
    user,
    userName: user?.name ?? "System",
    role,
    isAdmin,
    loading,
    mustChangePassword,
    isImpersonating,
    realUser,
    switchUser,
    exitImpersonation,
    logout,
    canAccess,
  }), [user, role, isAdmin, loading, mustChangePassword, isImpersonating, realUser,
      switchUser, exitImpersonation, logout, canAccess])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
