/**
 * Designer assignment must use an active Users-tab name so Performance
 * attribution stays exact (no free-text spelling drift).
 */
import { userService } from "@/modules/users"

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase()
}

/** Empty string = unassigned (allowed). Otherwise must match an active user name. */
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
  // Persist the canonical Users-tab spelling.
  return { ok: true, designer: match.name.trim().replace(/\s+/g, " ") }
}
