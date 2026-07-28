"use client"

import { RouteErrorBoundary } from "@/shared/components/route-error-boundary"

export default function UsersError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <RouteErrorBoundary
      tag="users.error"
      error={error}
      reset={reset}
      backHref="/users"
      backLabel="Back to users"
    />
  )
}
