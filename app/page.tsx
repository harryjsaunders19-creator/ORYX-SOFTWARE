import { format } from "date-fns"
import { DashboardStats } from "@/components/dashboard-stats"
import { PageHeader, PageShell } from "@/components/page-layout"

export default function DashboardPage() {
  const today = format(new Date(), "EEEE, d MMMM yyyy")

  return (
    <PageShell>
      <PageHeader title="Dashboard" description={today} />
      <DashboardStats />
    </PageShell>
  )
}
