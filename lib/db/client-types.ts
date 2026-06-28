/** Shared client types — used by SQLite stores, Supabase repo, and API layer. */

export interface ClientRow {
  id:             string
  name:           string
  nameLower:      string
  contactName:    string | null
  email:          string | null
  phone:          string | null
  billingAddress: string | null
  notes:          string | null
  accountCode:    string | null
  active:         number   // 1 = active, 0 = archived
  archivedAt:     string | null
  archivedBy:     string | null
  createdAt:      string
  updatedAt:      string
}

export interface CreateClientData {
  id:              string
  name:            string
  contactName?:    string | null
  email?:          string | null
  phone?:          string | null
  billingAddress?: string | null
  notes?:          string | null
  accountCode?:    string | null
}

export interface UpdateClientData {
  name?:           string
  contactName?:    string | null
  email?:          string | null
  phone?:          string | null
  billingAddress?: string | null
  notes?:          string | null
  accountCode?:    string | null
  active?:         number
  archivedAt?:     string | null
  archivedBy?:     string | null
}
