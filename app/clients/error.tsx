"use client"

import { RouteErrorBoundary } from "@/shared/components/route-error-boundary"

export default function ClientsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorBoundary tag="clients.error" error={error} reset={reset} backHref="/clients" backLabel="Back to clients" />
}
