"use client"

import { RouteErrorBoundary } from "@/shared/components/route-error-boundary"

export default function JobMapError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <RouteErrorBoundary
      tag="job-map.error"
      error={error}
      reset={reset}
      backHref="/job-map"
      backLabel="Back to job map"
    />
  )
}
