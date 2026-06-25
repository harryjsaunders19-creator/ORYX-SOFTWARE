"use client"
import { createContext, useContext, useEffect, useState, useCallback } from "react"
import type { User, Role } from "@/lib/types"
import { canAccessModule as canAccessModuleFn } from "@/lib/permissions"

interface UserCtx {
  user:        User | null
  userName:    string
  role:        Role
  isAdmin:     boolean
  loading:     boolean
  mustChangePassword: boolean
  isImpersonating: boolean
  realUser:    { id: string; name: string } | null
  /** Switches the active identity via /api/auth/switch. Throws with the
   *  server's error message if the switch is rejected (e.g. a non-admin
   *  trying to switch away from themselves) — callers should catch this
   *  and show it, not assume every call succeeds. */
  switchUser:  (userId: string) => Promise<void>
  /** Returns to the real identity without needing to know its id. */
  exitImpersonation: () => Promise<void>
  logout:      () => Promise<void>
  canAccess:   (moduleKey: string) => boolean
}

const Ctx = createContext<UserCtx>({
  user: null, userName: "System", role: "ENGINEER", isAdmin: false, loading: true,
  mustChangePassword: false, isImpersonating: false, realUser: null,
  switchUser: async () => {}, exitImpersonation: async () => {}, logout: async () => {}, canAccess: () => true,
})
export const useUser = () => useContext(Ctx)

interface SessionResponse { user: User | null; mustChangePassword?: boolean; isImpersonating: boolean; realUser: { id: string; name: string } | null }

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [isImpersonating, setIsImpersonating] = useState(false)
  const [realUser, setRealUser] = useState<{ id: string; name: string } | null>(null)

  const applySession = useCallback((d: SessionResponse) => {
    setUser(d.user)
    setMustChangePassword(d.mustChangePassword ?? false)
    setIsImpersonating(d.isImpersonating)
    setRealUser(d.realUser)
  }, [])

  useEffect(() => {
    fetch("/api/auth/session")
      .then(r => r.json() as Promise<SessionResponse>)
      .then(applySession)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [applySession])

  const switchUser = useCallback(async (userId: string) => {
    const res = await fetch("/api/auth/switch", {
      method: "POST", headers: { "Content-Type": "application/json" },
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
    setUser(null); setIsImpersonating(false); setRealUser(null)
    // Callers that need a redirect (e.g. sidebar logout button) do
    // window.location.href = "/login" themselves after awaiting this.
  }, [])

  const role    = user?.role ?? "ENGINEER"   // fail closed — see lib/auth.ts getCurrentRole()
  const isAdmin = role === "ADMIN"

  return (
    <Ctx.Provider value={{
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
      canAccess: (moduleKey: string) => canAccessModuleFn(role, moduleKey),
    }}>
      {children}
    </Ctx.Provider>
  )
}
