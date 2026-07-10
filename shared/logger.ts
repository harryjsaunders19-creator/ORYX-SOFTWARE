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
  notifyErrorWebhook(event, err, fields)
}

/** Log background task failures without failing the parent request. */
export function logBackgroundError(event: string, err: unknown, fields?: Record<string, unknown>): void {
  logError(event, err, fields)
}

const webhookUrl = () => process.env.ERROR_WEBHOOK_URL?.trim() || ""

/** Fire-and-forget optional webhook — never blocks the request path. */
function notifyErrorWebhook(
  event: string,
  err: unknown,
  fields?: Record<string, unknown>,
): void {
  const url = webhookUrl()
  if (!url) return
  const body = JSON.stringify({
    event,
    error: err instanceof Error ? err.message : String(err),
    fields,
    ts: new Date().toISOString(),
  })
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => { /* webhook must not break app */ })
}
