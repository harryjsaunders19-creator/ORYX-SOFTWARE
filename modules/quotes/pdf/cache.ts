/** In-process PDF byte cache keyed by quote id + updatedAt (invalidates on edit). */
const cache = new Map<string, { pdfBytes: Uint8Array; filename: string }>()

function cacheKey(id: string, updatedAt: string): string {
  return `${id}:${updatedAt}`
}

export function getCachedQuotePdf(
  id: string,
  updatedAt: string,
): { pdfBytes: Uint8Array; filename: string } | null {
  return cache.get(cacheKey(id, updatedAt)) ?? null
}

export function setCachedQuotePdf(
  id: string,
  updatedAt: string,
  pdfBytes: Uint8Array,
  filename: string,
): void {
  cache.set(cacheKey(id, updatedAt), { pdfBytes, filename })
  // Drop stale entries for this quote id.
  const prefix = `${id}:`
  for (const key of cache.keys()) {
    if (key.startsWith(prefix) && key !== cacheKey(id, updatedAt)) cache.delete(key)
  }
}

export function invalidateQuotePdf(id: string): void {
  const prefix = `${id}:`
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
}
