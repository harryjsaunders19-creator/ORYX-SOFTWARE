import { createAdminClient } from "@/lib/supabase/admin"
import { createId } from "@paralleldrive/cuid2"
import type { ClientContactInput, ClientContactRow } from "../types/client-contact-types"

function table() {
  return createAdminClient().from("client_contacts")
}

function toRow(row: Record<string, unknown>): ClientContactRow {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    name: row.name as string,
    email: row.email as string | null,
    phone: row.phone as string | null,
    role: row.role as string | null,
    isPrimary: row.is_primary ? 1 : 0,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export const supabaseClientContactRepo = {
  async findByClientId(clientId: string): Promise<ClientContactRow[]> {
    const { data, error } = await table()
      .select("*")
      .eq("client_id", clientId)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true })
    if (error) throw error
    return (data ?? []).map(toRow)
  },

  async replaceForClient(
    clientId: string,
    contacts: ClientContactInput[],
    now: string,
  ): Promise<ClientContactRow[]> {
    const { error: delErr } = await table().delete().eq("client_id", clientId)
    if (delErr) throw delErr
    if (!contacts.length) return []

    const rows = contacts.map((contact, index) => ({
      id: contact.id ?? createId(),
      client_id: clientId,
      name: contact.name,
      email: contact.email ?? null,
      phone: contact.phone ?? null,
      role: contact.role ?? null,
      is_primary: index === 0,
      sort_order: index,
      created_at: now,
      updated_at: now,
    }))

    const { data, error } = await table().insert(rows).select("*")
    if (error) throw error
    return (data ?? []).map(toRow)
  },
}
