"use client"

import { RouteErrorBoundary } from "@/shared/components/route-error-boundary"

export default function PerformanceError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <RouteErrorBoundary
      tag="performance.error"
      error={error}
      reset={reset}
      backHref="/performance"
      backLabel="Back to performance"
    />
  )
}
