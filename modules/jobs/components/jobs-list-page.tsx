import { Suspense } from "react"
import { JobsRegister } from "./jobs-register"
import { PageShell, DataPanel } from "@/shared/layouts/page-layout"
import { isWorkItemsModelEnabled } from "@/shared/supabase/feature-flags"

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
    <PageShell wide className="!pb-0">
      <Suspense fallback={<JobsListFallback />}>
        <JobsRegister workItemsModel={workItemsModel} />
      </Suspense>
    </PageShell>
  )
}
