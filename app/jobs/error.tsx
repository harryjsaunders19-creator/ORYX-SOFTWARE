"use client"

import { RouteErrorBoundary } from "@/shared/components/route-error-boundary"

export default function JobsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorBoundary tag="jobs.error" error={error} reset={reset} backHref="/jobs" backLabel="Back to jobs" />
}
