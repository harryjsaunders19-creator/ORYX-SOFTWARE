/**
 * Browser-side helper: POST a React error-boundary crash to /api/client-errors
 * so it reaches the server logger + ERROR_WEBHOOK_URL pipeline.
 * Fire-and-forget — never blocks UI recovery.
 */

type ClientErrorReport = {
  tag: string
  error: Error & { digest?: string }
}

export function reportClientError({ tag, error }: ClientErrorReport): void {
  try {
    const body = JSON.stringify({
      tag,
      message: error.message || String(error),
      stack: typeof error.stack === "string" ? error.stack : undefined,
      digest: error.digest,
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
    })

    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      /* reporting must never break the error UI */
    })
  } catch {
    /* ignore */
  }
}
