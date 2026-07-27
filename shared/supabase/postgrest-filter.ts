/**
 * Escape user input for PostgREST filter strings (.or / .ilike).
 * Reserved characters in the filter DSL can otherwise change query semantics.
 */
export function escapePostgrestFilterValue(raw: string): string {
  return raw
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/,/g, " ")
    .replace(/\(/g, " ")
    .replace(/\)/g, " ")
    .replace(/\./g, " ")
}

/** Build `col.ilike.%term%` clauses joined for `.or(...)`. */
export function postgrestOrIlike(columns: string[], term: string): string | null {
  const trimmed = term.trim()
  if (!trimmed) return null
  const safe = escapePostgrestFilterValue(trimmed)
  if (!safe) return null
  return columns.map(col => `${col}.ilike.%${safe}%`).join(",")
}

/**
 * PostgREST overlap filter for text[] tags using controlled JOB_TAGS values
 * that match the query. Example: tags.ov.{"Listed Building","Gantry"}
 */
export function postgrestTagsOverlap(column: string, matchingTags: string[]): string | null {
  if (!matchingTags.length) return null
  const quoted = matchingTags
    .map(tag => `"${tag.replace(/\\/g, "").replace(/"/g, "")}"`)
    .join(",")
  return `${column}.ov.{${quoted}}`
}
