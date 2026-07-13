"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[app.error]", error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center bg-pg px-4 text-center text-t1">
      <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-t3">
        An unexpected error occurred. You can try again or return to the home page.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button type="button" variant="primary" onClick={() => reset()}>
          Try again
        </Button>
        <Button type="button" variant="secondary" asChild>
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </div>
  )
}
