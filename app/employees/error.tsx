"use client"

import { RouteErrorBoundary } from "@/shared/components/route-error-boundary"

export default function EmployeesError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <RouteErrorBoundary
      tag="employees.error"
      error={error}
      reset={reset}
      backHref="/employees"
      backLabel="Back to employees"
    />
  )
}
