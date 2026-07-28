"use client"

import { useEffect } from "react"
import { reportClientError } from "@/shared/client-error-report"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[app.global-error]", error)
    reportClientError({ tag: "app.global-error", error })
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            textAlign: "center",
            background: "var(--color-pg, #f8f9fa)",
            color: "var(--color-t1, #191c1d)",
          }}
        >
          <h1 style={{ fontSize: "30px", fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em", margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: "0.5rem", maxWidth: "28rem", color: "var(--color-t3, #76777d)", fontSize: "14px", fontWeight: 400, lineHeight: 1.429 }}>
            A critical error occurred. Try again or go back to the home page.
          </p>
          <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "8px",
                border: "none",
                background: "var(--color-ac, #111827)",
                color: "var(--color-on-ac, #fff)",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 600,
                lineHeight: 1.429,
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/"
              }}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "8px",
                border: "1px solid var(--color-bd, #c6c6cd)",
                background: "var(--color-sr, #fff)",
                color: "inherit",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 600,
                lineHeight: 1.429,
              }}
            >
              Go home
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
