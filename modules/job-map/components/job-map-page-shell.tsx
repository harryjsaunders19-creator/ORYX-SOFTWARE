"use client"

import dynamic from "next/dynamic"
import { RequireRole } from "@/shared/auth/require-role"

const JobMapPage = dynamic(
  () => import("@/modules/job-map/components/job-map-page"),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-t3">Loading map…</p>
      </div>
    ),
  },
)

export function JobMapPageShell() {
  return (
    <RequireRole roles={["ADMIN", "ACCOUNTS"]}>
      <JobMapPage />
    </RequireRole>
  )
}
