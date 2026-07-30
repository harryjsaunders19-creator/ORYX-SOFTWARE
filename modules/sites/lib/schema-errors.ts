/** Detect PostgREST / Postgres errors when sites migration is not applied. */
export function isMissingSitesSchemaError(err: unknown): boolean {
  const obj = typeof err === "object" && err ? err as Record<string, unknown> : null
  const code = obj && "code" in obj ? String(obj.code) : ""
  // 42P01 = undefined_table; PGRST205 = table not in schema cache
  if (code === "42P01" || code === "PGRST205") {
    const hay = `${obj?.message ?? ""} ${obj?.details ?? ""} ${obj?.hint ?? ""}`.toLowerCase()
    if (hay.includes("site")) return true
  }

  const msg = err instanceof Error
    ? err.message
    : obj && "message" in obj
      ? String(obj.message)
      : String(err ?? "")
  const lower = msg.toLowerCase()
  return (
    lower.includes("could not find the table")
    || lower.includes("relation \"public.sites\" does not exist")
    || lower.includes("relation \"sites\" does not exist")
    || lower.includes("site_audit_events")
    || (lower.includes("schema cache") && lower.includes("sites"))
    || lower.includes("column sites.")
    || lower.includes("column \"site_id\"")
  )
}

export const SITES_MIGRATION_HINT =
  "Managed Sites require database migration 041_sites.sql. Apply it in Supabase, then retry."
