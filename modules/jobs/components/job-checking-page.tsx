import { Suspense } from "react"
import { JobsTable } from "./jobs-table"
import { ActiveWorkItemsTable } from "./active-work-items-table"
import { BackLink, PageHeader, PageShell, DataPanel } from "@/shared/layouts/page-layout"
import { isWorkItemsModelEnabled } from "@/shared/supabase/feature-flags"

export const metadata = { title: "Checking queue" }

function CheckingFallback() {
  return (
    <DataPanel>
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-12 border-b border-bd last:border-0 px-4 flex items-center gap-4">
          <div className="skeleton h-4 w-24 rounded" />
          <div className="skeleton h-4 flex-1 max-w-xs rounded" />
          <div className="skeleton h-4 w-20 rounded" />
        </div>
      ))}
    </DataPanel>
  )
}

export default function CheckingQueuePage() {
  const workItemsModel = isWorkItemsModelEnabled()

  return (
    <PageShell wide>
      <BackLink href="/jobs">All jobs</BackLink>
      <PageHeader
        title="Checking queue"
        description="Work awaiting technical review before issue"
      />
      <Suspense fallback={<CheckingFallback />}>
        {workItemsModel
          ? <ActiveWorkItemsTable mode="checking" />
          : <JobsTable mode="checking" />}
      </Suspense>
    </PageShell>
  )
}
