/**
 * Shared helpers for job document upload/update (SQLite + Supabase backends).
 */
import { isValidDocumentCategory } from "../constants"

export function resolveCategory(category: string | undefined): string {
  if (category && isValidDocumentCategory(category)) return category
  return "General"
}

/** email_date is timestamptz — only persist valid ISO timestamps. */
export function sanitizeEmailDate(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
