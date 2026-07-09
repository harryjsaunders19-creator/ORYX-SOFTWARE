/** A contact person linked to a client company. */

export interface ClientContactRow {
  id: string
  clientId: string
  name: string
  email: string | null
  phone: string | null
  role: string | null
  isPrimary: number
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface ClientContactInput {
  id?: string
  name: string
  email?: string | null
  phone?: string | null
  role?: string | null
}

export function emptyContact(): ClientContactInput {
  return { name: "", email: null, phone: null, role: null }
}

export function contactsFromClient(client: {
  contactName?: string | null
  email?: string | null
  phone?: string | null
}): ClientContactInput[] {
  if (!client.contactName && !client.email && !client.phone) {
    return [emptyContact()]
  }
  return [{
    name: client.contactName ?? "",
    email: client.email,
    phone: client.phone,
    role: null,
  }]
}

export function normalizeContactInputs(raw: ClientContactInput[]): ClientContactInput[] {
  const cleaned = raw
    .map(c => ({
      id: c.id,
      name: c.name.trim(),
      email: c.email?.trim() || null,
      phone: c.phone?.trim() || null,
      role: c.role?.trim() || null,
    }))
    .filter(c => c.name || c.email || c.phone)

  return cleaned.length ? cleaned : []
}

export function primaryContactFields(contacts: ClientContactInput[]): {
  contactName: string | null
  email: string | null
  phone: string | null
} {
  const primary = contacts[0]
  if (!primary) return { contactName: null, email: null, phone: null }
  return {
    contactName: primary.name || null,
    email: primary.email ?? null,
    phone: primary.phone ?? null,
  }
}
