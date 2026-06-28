/** Parse PostgREST aggregate response rows (e.g. `.select('quote_value.sum()')`). */
export function aggSum(row: unknown): number {
  if (!row || typeof row !== "object") return 0
  const o = row as Record<string, unknown>
  if (o.sum != null) return Number(o.sum)
  // Some PostgREST versions nest under the column name.
  for (const v of Object.values(o)) {
    if (v && typeof v === "object" && "sum" in (v as object)) {
      return Number((v as { sum: unknown }).sum ?? 0)
    }
  }
  return 0
}

export function aggAvg(row: unknown): number {
  if (!row || typeof row !== "object") return 0
  const o = row as Record<string, unknown>
  if (o.avg != null) return Number(o.avg)
  for (const v of Object.values(o)) {
    if (v && typeof v === "object" && "avg" in (v as object)) {
      return Number((v as { avg: unknown }).avg ?? 0)
    }
  }
  return 0
}

export function aggCount(row: unknown): number {
  if (!row || typeof row !== "object") return 0
  const o = row as Record<string, unknown>
  if (o.count != null) return Number(o.count)
  return 0
}
