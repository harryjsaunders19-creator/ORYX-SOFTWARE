import JobDetailPage from "@/modules/jobs/components/job-detail-page"
import ParentJobDashboardPage from "@/modules/jobs/components/parent-job-dashboard"
import { getCurrentUser } from "@/shared/auth/auth"
import { jobService } from "@/modules/jobs/services/job-service"
import { parentJobService, workItemService } from "@/modules/jobs/services/parent-work-item-service"
import { cancelRecordForJob } from "@/lib/cancel-record"
import { billingHandoffService } from "@/modules/billing"
import { useWorkItemsModel } from "@/lib/supabase/feature-flags"
import type { Job } from "@/lib/types"
import type { BillingHandoff } from "@/lib/types"
import type { ParentJobDashboard } from "@/modules/jobs/types/parent-dashboard-types"

type JobDetailFallback = Job & {
  parentJob?: Job | null
  billingHandoff?: BillingHandoff | null
  cancelRecord?: unknown
}

export default async function JobDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  if (useWorkItemsModel()) {
    let fallback: ParentJobDashboard | null = null
    const user = await getCurrentUser().catch(() => null)
    if (user) {
      try {
        fallback = await parentJobService.getDashboard(id)
        if (!fallback) {
          const wi = await workItemService.findUnique(id)
          if (wi) fallback = await parentJobService.getDashboard(wi.parentJobId)
        }
      } catch {
        fallback = null
      }
    }

    if (fallback) {
      return <ParentJobDashboardPage parentId={fallback.parent.id} fallback={fallback} />
    }

    // Non-design standalone jobs (site visit, survey, …) still use the classic detail page
    let fallbackJob: JobDetailFallback | null = null
    if (user) {
      try {
        const job = await jobService.findUnique(id)
        if (job) {
          const base = job.archivedAt
            ? { ...job, cancelRecord: await cancelRecordForJob(id) }
            : job
          const billingHandoff = user.role === "ADMIN"
            ? await billingHandoffService.findBySourceJobId(id)
            : null
          fallbackJob = {
            ...base,
            parentJob: null,
            billingHandoff: billingHandoff as BillingHandoff | null,
          }
        }
      } catch {
        fallbackJob = null
      }
    }
    return <JobDetailPage fallbackJob={fallbackJob} />
  }

  let fallbackJob: JobDetailFallback | null = null

  const user = await getCurrentUser().catch(() => null)
  if (user) {
    try {
      const job = await jobService.findUnique(id)
      if (job) {
        const base = job.archivedAt
          ? { ...job, cancelRecord: await cancelRecordForJob(id) }
          : job
        const [parentJob, billingHandoff] = await Promise.all([
          job.parentJobId ? jobService.findUnique(job.parentJobId) : Promise.resolve(null),
          user.role === "ADMIN"
            ? billingHandoffService.findBySourceJobId(id)
            : Promise.resolve(null),
        ])
        fallbackJob = {
          ...base,
          parentJob,
          billingHandoff: billingHandoff as BillingHandoff | null,
        }
      }
    } catch {
      fallbackJob = null
    }
  }

  return <JobDetailPage fallbackJob={fallbackJob} />
}
