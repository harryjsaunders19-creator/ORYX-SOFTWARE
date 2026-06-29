/** Human-readable message from unknown thrown/rejected values (incl. PostgREST errors). */
export function errorMessage(err: unknown): string {
  if (err == null) return "Unknown error"
  if (typeof err === "string") return err
  if (err instanceof Error) return err.message || err.name
  if (typeof err === "object") {
    const o = err as Record<string, unknown>
    if (typeof o.message === "string" && o.message.trim()) return o.message
    if (typeof o.error === "string" && o.error.trim()) return o.error
    if (typeof o.detail === "string" && o.detail.trim()) return o.detail
    try {
      return JSON.stringify(err)
    } catch {
      return "Unknown error"
    }
  }
  return String(err)
}

/** Parse `{ error, detail }` JSON bodies from failed API responses. */
export function apiErrorDetail(body: unknown, status: number): string {
  if (!body || typeof body !== "object") return `Request failed (${status})`
  const b = body as Record<string, unknown>
  if (b.detail != null) {
    const detail = errorMessage(b.detail)
    if (detail && detail !== "Unknown error") return detail
  }
  if (b.error != null) {
    const err = errorMessage(b.error)
    if (err && err !== "Unknown error") return err
  }
  return `Request failed (${status})`
}
