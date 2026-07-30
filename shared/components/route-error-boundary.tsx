"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { reportClientError } from "@/shared/client-error-report"
import { Typography } from "@/shared/design/typography"
import { cn } from "@/shared/utils"

type Props = {
  tag: string
  error: Error & { digest?: string }
  reset: () => void
  backHref?: string
  backLabel?: string
}

export function RouteErrorBoundary({ tag, error, reset, backHref = "/", backLabel = "Go home" }: Props) {
  useEffect(() => {
    console.error(`[${tag}]`, error)
    reportClientError({ tag, error })
  }, [tag, error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center bg-pg px-4 text-center text-t1">
      <h1 className={cn(Typography.PageTitle)}>Something went wrong</h1>
      <p className={cn(Typography.Small, "mt-2 max-w-md text-t3")}>
        An unexpected error occurred. You can try again or go back.
      </p>
      {(error.message || error.digest) && (
        <pre className="mt-4 max-h-48 max-w-xl overflow-auto rounded-lg border border-bd bg-sr p-3 text-left text-xs text-t2 whitespace-pre-wrap">
          {error.message || "Unknown error"}
          {error.digest ? `\nDigest: ${error.digest}` : ""}
        </pre>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button type="button" variant="primary" onClick={() => reset()}>
          Try again
        </Button>
        <Button type="button" variant="secondary" asChild>
          <Link href={backHref}>{backLabel}</Link>
        </Button>
      </div>
    </div>
  )
}
