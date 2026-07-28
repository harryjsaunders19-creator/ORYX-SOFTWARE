"use client"

import { RouteErrorBoundary } from "@/shared/components/route-error-boundary"

export default function PasswordVaultError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <RouteErrorBoundary
      tag="password-vault.error"
      error={error}
      reset={reset}
      backHref="/password-vault"
      backLabel="Back to password vault"
    />
  )
}
