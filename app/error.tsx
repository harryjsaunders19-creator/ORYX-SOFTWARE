"use client"

import { RouteErrorBoundary } from "@/shared/components/route-error-boundary"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RouteErrorBoundary tag="app.error" error={error} reset={reset} />
}
