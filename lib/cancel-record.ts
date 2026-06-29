import type { CancelRecord } from "@/lib/types"
import { archiveLogService } from "@/lib/services/archive-log-service"

type Archivable = { id: string; archivedAt?: string | null }

function toCancelRecord(entry: {
  reason: string | null
  performedByName: string
  performedAt: string
}): CancelRecord {
  return {
    reason: entry.reason ?? "",
    performedByName: entry.performedByName,
    performedAt: entry.performedAt,
  }
}

/** Attach latest ArchiveLog cancellation metadata to archived jobs. */
export async function attachCancelRecords<T extends Archivable>(
  jobs: T[],
): Promise<(T & { cancelRecord: CancelRecord | null })[]> {
  const archivedIds = jobs.filter(j => j.archivedAt).map(j => j.id)
  const logMap = await archiveLogService.findLatestArchiveForJobs(archivedIds)
  return jobs.map(job => ({
    ...job,
    cancelRecord: job.archivedAt
      ? (logMap.has(job.id) ? toCancelRecord(logMap.get(job.id)!) : null)
      : null,
  }))
}

export async function cancelRecordForJob(jobId: string): Promise<CancelRecord | null> {
  const entries = await archiveLogService.findForEntity("job", jobId)
  const latest = entries.find(e => e.action === "archive")
  return latest ? toCancelRecord(latest) : null
}
