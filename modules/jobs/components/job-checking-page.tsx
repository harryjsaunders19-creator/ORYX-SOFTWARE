import { Suspense } from "react"
import { JobsTable } from "./jobs-table"
import { BackLink, PageHeader, PageShell } from "@/shared/layouts/page-layout"

export const metadata = { title: "Checking queue" }

export default function CheckingQueuePage() {
  return (
    <PageShell wide>
      <BackLink href="/jobs">All jobs</BackLink>
      <PageHeader
        title="Checking queue"
        description="Jobs awaiting technical review before issue"
      />
      <Suspense>
        <JobsTable mode="checking" />
      </Suspense>
    </PageShell>
  )
}
