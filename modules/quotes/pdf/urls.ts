/** Authenticated download URL — PDF bytes are streamed by the API route. */
export function quotePdfDownloadUrl(quoteId: string): string {
  return `/api/quotes/${quoteId}/pdf?download=1`
}

/** Normalise legacy static paths stored before Vercel-safe streaming. */
export function resolveQuotePdfUrl(quoteId: string, pdfPath: string | null): string | null {
  if (!pdfPath) return null
  return quotePdfDownloadUrl(quoteId)
}
