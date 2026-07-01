import { Suspense } from "react"
import { JobsTable } from "./jobs-table"
import { PageHeader, PageShell } from "@/shared/layouts/page-layout"

export const metadata = { title: "Jobs" }

export default function JobsPage() {
  return (
    <PageShell wide>
      <PageHeader title="Jobs" description="Manage scaffold design jobs" />
      <Suspense>
        <JobsTable />
      </Suspense>
    </PageShell>
  )
}
