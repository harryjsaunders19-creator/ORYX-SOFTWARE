import { Suspense } from "react"
import { JobsTable } from "@/components/jobs-table"

export const metadata = { title: "Jobs" }

export default function JobsPage() {
  return (
    <div className="px-6 py-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-t1">Jobs</h1>
        <p className="text-sm text-t3 mt-0.5">Manage scaffold design jobs</p>
      </div>
      <Suspense>
        <JobsTable />
      </Suspense>
    </div>
  )
}
