import { Suspense } from "react"
import { JobsTable } from "./jobs-table"
import { ActiveWorkItemsTable } from "./active-work-items-table"
import { PageHeader, PageShell, DataPanel } from "@/shared/layouts/page-layout"
import { isWorkItemsModelEnabled } from "@/lib/supabase/feature-flags"

export const metadata = { title: "Jobs" }

function JobsListFallback() {
  return (
    <DataPanel>
      {[...Array(8)].map((_, i) => (
        <div key={i} className="h-12 border-b border-bd last:border-0 px-4 flex items-center gap-4">
          <div className="skeleton h-4 w-24 rounded" />
          <div className="skeleton h-4 flex-1 max-w-xs rounded" />
          <div className="skeleton h-4 w-20 rounded" />
        </div>
      ))}
    </DataPanel>
  )
}

export default function JobsPage() {
  const workItemsModel = isWorkItemsModelEnabled()

  return (
    <PageShell wide>
      <PageHeader
        title="Jobs"
        description={
          workItemsModel
            ? "Active work items — open a row to view the Parent Job project dashboard"
            : "Manage scaffold design jobs"
        }
      />
      <Suspense fallback={<JobsListFallback />}>
        {workItemsModel ? <ActiveWorkItemsTable /> : <JobsTable />}
      </Suspense>
    </PageShell>
  )
}
