import JobDetailPage from "@/modules/jobs/components/job-detail-page"
import { getCurrentUser } from "@/shared/auth/auth"
import { jobService } from "@/modules/jobs/services/job-service"
import { cancelRecordForJob } from "@/lib/cancel-record"
import { billingHandoffService } from "@/modules/billing"
import type { Job } from "@/lib/types"
import type { BillingHandoff } from "@/lib/types"

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
