import { format } from "date-fns"
import { PageHeader, PageShell } from "@/shared/layouts/page-layout"
import { DashboardStats } from "./dashboard-stats"

export default function DashboardPage() {
  const today = format(new Date(), "EEEE, d MMMM yyyy")

  return (
    <PageShell>
      <PageHeader title="Dashboard" description={today} />
      <DashboardStats />
    </PageShell>
  )
}
