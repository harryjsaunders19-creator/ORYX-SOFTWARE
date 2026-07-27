import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center bg-pg px-4 text-center text-t1">
      <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-t3">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="mt-6">
        <Button variant="primary" asChild>
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </div>
  )
}
