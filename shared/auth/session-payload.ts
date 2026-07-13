import type { User } from "@/lib/types"
import type { UserRow } from "@/lib/db/user-types"
import { getCurrentUser, getRealUser } from "@/shared/auth/auth"

export type SessionPayload = {
  user: User | null
  mustChangePassword: boolean
  isImpersonating: boolean
  realUser: { id: string; name: string } | null
}

function toPublicUser(raw: UserRow | null): User | null {
  if (!raw) return null
  return {
    id: raw.id,
    name: raw.name,
    email: raw.email,
    role: raw.role,
    active: raw.active,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
}

/** Shared shape for /api/auth/session and RSC layout seeding. */
export async function buildSessionPayload(): Promise<SessionPayload> {
  const [rawUser, realUser] = await Promise.all([getCurrentUser(), getRealUser()])
  const impersonating = !!rawUser && !!realUser && rawUser.id !== realUser.id
  return {
    user: toPublicUser(rawUser),
    mustChangePassword: rawUser?.mustChangePassword === 1,
    isImpersonating: impersonating,
    realUser: impersonating ? { id: realUser!.id, name: realUser!.name } : null,
  }
}
