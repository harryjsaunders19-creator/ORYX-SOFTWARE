import { Suspense } from "react"
import { JobsTable } from "./jobs-table"
import { ActiveWorkItemsTable } from "./active-work-items-table"
import { BackLink, PageHeader, PageShell } from "@/shared/layouts/page-layout"
import { useWorkItemsModel } from "@/lib/supabase/feature-flags"

export const metadata = { title: "Checking queue" }

export default function CheckingQueuePage() {
  const workItemsModel = useWorkItemsModel()

  return (
    <PageShell wide>
      <BackLink href="/jobs">All jobs</BackLink>
      <PageHeader
        title="Checking queue"
        description="Work awaiting technical review before issue"
      />
      <Suspense>
        {workItemsModel
          ? <ActiveWorkItemsTable mode="checking" />
          : <JobsTable mode="checking" />}
      </Suspense>
    </PageShell>
  )
}
