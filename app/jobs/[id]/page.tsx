import JobDetailPage from "@/modules/jobs/components/job-detail-page"
import ParentJobDashboardPage from "@/modules/jobs/components/parent-job-dashboard"
import { getCurrentUser } from "@/shared/auth/auth"
import { jobService } from "@/modules/jobs/services/job-service"
import { parentJobService, workItemService } from "@/modules/jobs/services/parent-work-item-service"
import { cancelRecordForJob } from "@/modules/archive/cancel-record"
import { billingHandoffService } from "@/modules/billing"
import { isWorkItemsModelEnabled } from "@/shared/supabase/feature-flags"
import type { Job } from "@/lib/types"
import type { BillingHandoff } from "@/lib/types"
import type { ParentJobDashboard } from "@/modules/jobs/types/parent-dashboard-types"
import type { UserRow } from "@/modules/users/types"

type JobDetailFallback = Job & {
  parentJob?: Job | null
  billingHandoff?: BillingHandoff | null
  cancelRecord?: unknown
  currentRevision?: Job | null
  currentRevisionId?: string | null
  currentRevisionLetter?: string | null
  hasRevisions?: boolean
  revisionCount?: number
}

async function loadClassicJobFallback(
  id: string,
  user: UserRow,
  opts: { includeParent: boolean },
): Promise<JobDetailFallback | null> {
  const job = await jobService.findUnique(id)
  if (!job) return null

  const payload = job.archivedAt
    ? { ...job, cancelRecord: await cancelRecordForJob(id) }
    : job

  const { enrichJobsWithLinkedQuotes } = await import("@/modules/jobs/api/enrich-linked-quotes")
  const needsCurrent = !job.parentJobId

  const [enrichedList, parentJob, latest, revisionCount] = await Promise.all([
    enrichJobsWithLinkedQuotes([payload]),
    opts.includeParent && job.parentJobId
      ? jobService.findUnique(job.parentJobId)
      : Promise.resolve(null),
    needsCurrent ? jobService.findLatestRevisionForParent(job.id) : Promise.resolve(null),
    needsCurrent ? jobService.countRevisionsForParent(job.id) : Promise.resolve(0),
  ])
  const enriched = enrichedList[0] ?? payload

  const currentRevisionId = latest?.id ?? (needsCurrent ? job.id : undefined)
  const billingHandoff = user.role === "ADMIN"
    ? await billingHandoffService.findBySourceJobId(currentRevisionId ?? id)
    : null

  return {
    ...enriched,
    parentJob: opts.includeParent ? parentJob : null,
    billingHandoff: billingHandoff as BillingHandoff | null,
    ...(needsCurrent
      ? {
          currentRevision: latest,
          currentRevisionId: currentRevisionId ?? job.id,
          currentRevisionLetter: latest?.revisionLetter ?? null,
          hasRevisions: revisionCount > 0,
          revisionCount,
        }
      : {}),
  }
}

export default async function JobDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser().catch(() => null)

  if (isWorkItemsModelEnabled()) {
    let fallback: ParentJobDashboard | null = null
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
        fallbackJob = await loadClassicJobFallback(id, user, { includeParent: false })
      } catch {
        fallbackJob = null
      }
    }
    return <JobDetailPage fallbackJob={fallbackJob} />
  }

  let fallbackJob: JobDetailFallback | null = null
  if (user) {
    try {
      fallbackJob = await loadClassicJobFallback(id, user, { includeParent: true })
    } catch {
      fallbackJob = null
    }
  }

  return <JobDetailPage fallbackJob={fallbackJob} />
}
