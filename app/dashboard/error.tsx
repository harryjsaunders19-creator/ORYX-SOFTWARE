"use client"

import { RouteErrorBoundary } from "@/shared/components/route-error-boundary"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <RouteErrorBoundary
      tag="dashboard.error"
      error={error}
      reset={reset}
      backHref="/"
      backLabel="Back to dashboard"
    />
  )
}
