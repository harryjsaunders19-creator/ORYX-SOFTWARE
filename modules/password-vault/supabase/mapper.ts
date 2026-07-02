import type { PasswordVaultEntryRow } from "@/lib/db/vault-types"

export interface SupabasePasswordVaultEntryRow {
  id: string
  service_name: string
  service_name_lower: string
  login_url: string | null
  username: string | null
  username_lower: string | null
  password_enc: string
  category: string | null
  category_lower: string | null
  notes: string | null
  extra_json: string | null
  created_at: string
  updated_at: string
}

export function toPasswordVaultEntryRow(row: SupabasePasswordVaultEntryRow): PasswordVaultEntryRow {
  return {
    id: row.id,
    serviceName: row.service_name,
    serviceNameLower: row.service_name_lower,
    loginUrl: row.login_url,
    username: row.username,
    passwordEnc: row.password_enc,
    category: row.category,
    notes: row.notes,
    extraJson: row.extra_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toSupabasePasswordVaultEntryRow(row: PasswordVaultEntryRow): SupabasePasswordVaultEntryRow {
  return {
    id: row.id,
    service_name: row.serviceName,
    service_name_lower: row.serviceNameLower,
    login_url: row.loginUrl,
    username: row.username,
    username_lower: row.username?.toLowerCase() ?? null,
    password_enc: row.passwordEnc,
    category: row.category,
    category_lower: row.category?.toLowerCase() ?? null,
    notes: row.notes,
    extra_json: row.extraJson,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}
