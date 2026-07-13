import type { ClientContactInput } from "../types/client-contact-types"

export function parseContactsFromBody(body: Record<string, unknown>): ClientContactInput[] | undefined {
  if (!Array.isArray(body.contacts)) return undefined
  return body.contacts.map((raw) => {
    const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
    return {
      id: typeof row.id === "string" ? row.id : undefined,
      name: typeof row.name === "string" ? row.name.trim() : "",
      email: row.email != null ? String(row.email).trim() || null : null,
      phone: row.phone != null ? String(row.phone).trim() || null : null,
      role: row.role != null ? String(row.role).trim() || null : null,
    }
  })
}
