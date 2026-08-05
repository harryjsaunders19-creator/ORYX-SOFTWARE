import { PageShell } from "@/components/page-layout"
import { DashboardSkeleton } from "@/modules/dashboard/components/dashboard-skeleton"

/** Root loading — matches live dashboard layout (shared with client isLoading). */
export default function Loading() {
  return (
    <PageShell>
      <DashboardSkeleton />
    </PageShell>
  )
}
