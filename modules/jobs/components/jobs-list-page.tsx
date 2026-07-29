import { Suspense } from "react"
import { JobsTable } from "./jobs-table"
import { ActiveWorkItemsTable } from "./active-work-items-table"
import { PageShell, DataPanel } from "@/shared/layouts/page-layout"
import { isWorkItemsModelEnabled } from "@/shared/supabase/feature-flags"

export const metadata = { title: "Jobs" }

function JobsListFallback() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="skeleton h-8 w-48 rounded" />
        <div className="skeleton h-4 w-80 max-w-full rounded" />
      </div>
      <div className="skeleton h-14 w-full rounded-xl" />
      <DataPanel>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-12 border-b border-bd last:border-0 px-4 flex items-center gap-4">
            <div className="skeleton h-4 w-24 rounded" />
            <div className="skeleton h-4 flex-1 max-w-xs rounded" />
            <div className="skeleton h-4 w-20 rounded" />
          </div>
        ))}
      </DataPanel>
    </div>
  )
}

export default function JobsPage() {
  const workItemsModel = isWorkItemsModelEnabled()

  return (
    <PageShell wide>
      <Suspense fallback={<JobsListFallback />}>
        {workItemsModel ? <ActiveWorkItemsTable /> : <JobsTable />}
      </Suspense>
    </PageShell>
  )
}
