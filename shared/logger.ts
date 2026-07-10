/** Structured server-side logging — JSON lines for Vercel/log drains. */
export function logEvent(
  event: string,
  fields?: Record<string, unknown>,
  level: "info" | "warn" | "error" = "info",
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  })
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.log(line)
}

export function logError(event: string, err: unknown, fields?: Record<string, unknown>): void {
  logEvent(event, {
    ...fields,
    error: err instanceof Error ? err.message : String(err),
    ...(err instanceof Error && err.stack ? { stack: err.stack } : {}),
  }, "error")
}
