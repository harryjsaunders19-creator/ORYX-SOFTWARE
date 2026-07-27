"use client"

import { RouteErrorBoundary } from "@/shared/components/route-error-boundary"

export default function BillingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorBoundary tag="billing.error" error={error} reset={reset} backHref="/billing" backLabel="Back to billing" />
}
