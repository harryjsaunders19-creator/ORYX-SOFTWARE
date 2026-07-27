"use client"

import { RouteErrorBoundary } from "@/shared/components/route-error-boundary"

export default function QuotesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorBoundary tag="quotes.error" error={error} reset={reset} backHref="/quotes" backLabel="Back to quotes" />
}
