/**
 * lib/supabase/mappers/client.ts — map between ClientRow (app) and Supabase row (snake_case).
 */
import type { ClientRow, CreateClientData, UpdateClientData } from "@/lib/db/client-types"

export interface SupabaseClientRow {
  id: string
  name: string
  name_lower: string
  contact_name: string | null
  email: string | null
  phone: string | null
  billing_address: string | null
  notes: string | null
  account_code: string | null
  active: boolean
  archived_at: string | null
  archived_by: string | null
  created_at: string
  updated_at: string
}

export function toClientRow(row: SupabaseClientRow): ClientRow {
  return {
    id: row.id,
    name: row.name,
    nameLower: row.name_lower,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    billingAddress: row.billing_address,
    notes: row.notes,
    accountCode: row.account_code,
    active: row.active ? 1 : 0,
    archivedAt: row.archived_at ?? null,
    archivedBy: row.archived_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toSupabaseInsert(data: CreateClientData, now: string): Omit<SupabaseClientRow, "created_at" | "updated_at"> & { created_at: string; updated_at: string } {
  return {
    id: data.id,
    name: data.name.trim(),
    name_lower: data.name.trim().toLowerCase(),
    contact_name: data.contactName?.trim() || null,
    email: data.email?.trim() || null,
    phone: data.phone?.trim() || null,
    billing_address: data.billingAddress?.trim() || null,
    notes: data.notes?.trim() || null,
    account_code: data.accountCode?.trim() || null,
    active: true,
    archived_at: null,
    archived_by: null,
    created_at: now,
    updated_at: now,
  }
}

export function toSupabaseRow(client: ClientRow): SupabaseClientRow {
  return {
    id: client.id,
    name: client.name,
    name_lower: client.nameLower,
    contact_name: client.contactName,
    email: client.email,
    phone: client.phone,
    billing_address: client.billingAddress,
    notes: client.notes,
    account_code: client.accountCode,
    active: client.active === 1,
    archived_at: client.archivedAt,
    archived_by: client.archivedBy,
    created_at: client.createdAt,
    updated_at: client.updatedAt,
  }
}

export function toSupabaseUpdate(data: UpdateClientData, existing: ClientRow, now: string): Partial<SupabaseClientRow> {
  const patch: Partial<SupabaseClientRow> = { updated_at: now }
  if (data.name !== undefined) {
    patch.name = data.name.trim()
    patch.name_lower = data.name.trim().toLowerCase()
  }
  if (data.contactName !== undefined) patch.contact_name = data.contactName?.trim() || null
  if (data.email !== undefined) patch.email = data.email?.trim() || null
  if (data.phone !== undefined) patch.phone = data.phone?.trim() || null
  if (data.billingAddress !== undefined) patch.billing_address = data.billingAddress?.trim() || null
  if (data.notes !== undefined) patch.notes = data.notes?.trim() || null
  if (data.accountCode !== undefined) patch.account_code = data.accountCode?.trim() || null
  if (data.active !== undefined) patch.active = data.active === 1
  if (data.archivedAt !== undefined) patch.archived_at = data.archivedAt ?? null
  if (data.archivedBy !== undefined) patch.archived_by = data.archivedBy ?? null
  return patch
}
