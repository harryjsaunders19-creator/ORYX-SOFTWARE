"use client"

import { RouteErrorBoundary } from "@/shared/components/route-error-boundary"

export default function SiteVisitCalculatorError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <RouteErrorBoundary
      tag="site-visit-calculator.error"
      error={error}
      reset={reset}
      backHref="/site-visit-calculator"
      backLabel="Back to site visit calculator"
    />
  )
}
