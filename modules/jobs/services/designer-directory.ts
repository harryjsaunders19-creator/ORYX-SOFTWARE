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

/** Empty string = unassigned (allowed). Otherwise must match an eligible designer. */
export async function resolveDirectoryDesigner(
  raw: string | null | undefined,
): Promise<{ ok: true; designer: string } | { ok: false; error: string }> {
  const trimmed = (raw ?? "").trim().replace(/\s+/g, " ")
  if (!trimmed) return { ok: true, designer: "" }

  const users = await userService.findMany({ activeOnly: true })
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
  const users = await userService.findMany({ activeOnly: true })
  return [...new Set(
    users
      .filter(u => isDesignerEligible(u))
      .map(u => u.name.trim().replace(/\s+/g, " "))
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b))
}
