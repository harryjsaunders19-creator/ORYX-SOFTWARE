"use client"

import { RouteErrorBoundary } from "@/shared/components/route-error-boundary"

export default function BackupsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <RouteErrorBoundary
      tag="backups.error"
      error={error}
      reset={reset}
      backHref="/backups"
      backLabel="Back to backups"
    />
  )
}
