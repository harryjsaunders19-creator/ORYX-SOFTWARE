/** Field weights for relevance ranking (higher = more important). */
export const SEARCH_WEIGHTS = {
  exactId: 1.2,
  number: 1.0,
  clientName: 0.9,
  project: 0.75,
  address: 0.7,
  person: 0.55,
  other: 0.4,
} as const

export function scoreField(
  query: string,
  value: string | null | undefined,
  weight: number,
): number {
  if (!value) return 0
  const needle = query.trim().toLowerCase()
  if (!needle) return 0
  const hay = value.toLowerCase().trim()
  if (!hay) return 0

  if (hay === needle) return 100 * weight
  if (hay.startsWith(needle)) return 85 * weight
  if (hay.includes(needle)) return 55 * weight

  const tokens = hay.split(/[\s/_\-,.|]+/).filter(Boolean)
  for (const token of tokens) {
    if (token === needle) return 75 * weight
    if (token.startsWith(needle)) return 65 * weight
  }
  return 0
}

export function bestScore(
  query: string,
  fields: Array<{ value: string | null | undefined; weight: number }>,
): number {
  let best = 0
  for (const field of fields) {
    best = Math.max(best, scoreField(query, field.value, field.weight))
  }
  return best
}

/** Split text into chunks for highlight rendering. */
export function highlightParts(text: string, query: string): Array<{ text: string; match: boolean }> {
  const needle = query.trim()
  if (!needle || !text) return [{ text, match: false }]
  const lower = text.toLowerCase()
  const q = needle.toLowerCase()
  const parts: Array<{ text: string; match: boolean }> = []
  let cursor = 0
  while (cursor < text.length) {
    const idx = lower.indexOf(q, cursor)
    if (idx === -1) {
      parts.push({ text: text.slice(cursor), match: false })
      break
    }
    if (idx > cursor) parts.push({ text: text.slice(cursor, idx), match: false })
    parts.push({ text: text.slice(idx, idx + needle.length), match: true })
    cursor = idx + needle.length
  }
  return parts
}
