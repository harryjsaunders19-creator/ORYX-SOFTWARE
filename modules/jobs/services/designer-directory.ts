/**
 * Designer assignment must use an active designer-eligible Users-tab name
 * so Performance attribution stays exact (no free-text spelling drift).
 *
 * Accounts users are never designer-eligible — they remain visible in audit
 * fields (created_by etc.) but must not appear in assignment pickers.
 */
import { userService } from "@/modules/users"
import { isDesignerEligible } from "@/shared/auth/permissions"

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase()
}

type EligibleCache = { names: string[]; users: Awaited<ReturnType<typeof userService.findMany>>; expiresAt: number }

/** Short TTL — designers change rarely; invalidated on demand after user mutations. */
const DESIGNER_CACHE_TTL_MS = 60_000
let eligibleCache: EligibleCache | null = null

async function loadEligibleUsers() {
  const now = Date.now()
  if (eligibleCache && eligibleCache.expiresAt > now) return eligibleCache
  const users = await userService.findMany({ activeOnly: true })
  const names = [...new Set(
    users
      .filter(u => isDesignerEligible(u))
      .map(u => u.name.trim().replace(/\s+/g, " "))
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b))
  eligibleCache = { names, users, expiresAt: now + DESIGNER_CACHE_TTL_MS }
  return eligibleCache
}

/** Call after Users create/update/deactivate so pickers refresh promptly. */
export function invalidateDesignerDirectoryCache(): void {
  eligibleCache = null
}

/** Empty string = unassigned (allowed). Otherwise must match an eligible designer. */
export async function resolveDirectoryDesigner(
  raw: string | null | undefined,
): Promise<{ ok: true; designer: string } | { ok: false; error: string }> {
  const trimmed = (raw ?? "").trim().replace(/\s+/g, " ")
  if (!trimmed) return { ok: true, designer: "" }

  const { users } = await loadEligibleUsers()
  const key = normalizeName(trimmed)
  const match = users.find(u => normalizeName(u.name) === key)
  if (!match) {
    return {
      ok: false,
      error: "Designer must be an active user from the Users list",
    }
  }
  if (!isDesignerEligible(match)) {
    return {
      ok: false,
      error: "Accounts users cannot be assigned as designers",
    }
  }
  // Persist the canonical Users-tab spelling.
  return { ok: true, designer: match.name.trim().replace(/\s+/g, " ") }
}

/** Active Admin + Engineer names for designer pickers (Accounts excluded). */
export async function listDesignerEligibleNames(): Promise<string[]> {
  const { names } = await loadEligibleUsers()
  return names
}
