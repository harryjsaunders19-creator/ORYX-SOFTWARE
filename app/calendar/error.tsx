"use client"

import { RouteErrorBoundary } from "@/shared/components/route-error-boundary"

export default function CalendarError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorBoundary tag="calendar.error" error={error} reset={reset} backHref="/calendar" backLabel="Back to calendar" />
}
