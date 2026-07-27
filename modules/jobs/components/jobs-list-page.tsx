import { Suspense } from "react"
import { JobsTable } from "./jobs-table"
import { ActiveWorkItemsTable } from "./active-work-items-table"
import { PageHeader, PageShell } from "@/shared/layouts/page-layout"
import { isWorkItemsModelEnabled } from "@/lib/supabase/feature-flags"

export const metadata = { title: "Jobs" }

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
      <Suspense>
        {workItemsModel ? <ActiveWorkItemsTable /> : <JobsTable />}
      </Suspense>
    </PageShell>
  )
}
