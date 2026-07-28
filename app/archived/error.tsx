"use client"

import { RouteErrorBoundary } from "@/shared/components/route-error-boundary"

export default function ArchivedError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <RouteErrorBoundary
      tag="archived.error"
      error={error}
      reset={reset}
      backHref="/archived"
      backLabel="Back to archive"
    />
  )
}
