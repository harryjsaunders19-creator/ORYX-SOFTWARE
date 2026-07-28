"use client"

import { RouteErrorBoundary } from "@/shared/components/route-error-boundary"

export default function HealthError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <RouteErrorBoundary
      tag="health.error"
      error={error}
      reset={reset}
      backHref="/health"
      backLabel="Back to health"
    />
  )
}
