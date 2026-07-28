import { format } from "date-fns"
import { getJobStatus } from "@/lib/constants"
import { parseLocalDate } from "@/shared/utils/utils"
import { buildCsv, downloadCsv } from "@/shared/utils/download-csv"
import type { Job } from "@/lib/types"

export type JobsExportFilters = {
  search: string
  statusFilter: string
  itemTypeFilter: string
  typeOfWorksFilter: string
  deadlineFilter: string
  onlyOriginals: boolean
  onlyRevisions: boolean
}

type ToastFn = (message: string, variant?: "success" | "error" | "info") => void

export async function exportJobsToCsv(
  filters: JobsExportFilters,
  toast: ToastFn,
): Promise<void> {
  const {
    search,
    statusFilter,
    itemTypeFilter,
    typeOfWorksFilter,
    deadlineFilter,
    onlyOriginals,
    onlyRevisions,
  } = filters

  const qs = new URLSearchParams({
    export: "true",
    ...(search                  && { search }),
    ...(statusFilter !== "ALL"  && { status: statusFilter }),
    ...(itemTypeFilter && itemTypeFilter !== "ALL" && { itemType: itemTypeFilter }),
    ...(typeOfWorksFilter && typeOfWorksFilter !== "ALL" && { typeOfWorks: typeOfWorksFilter }),
    ...(deadlineFilter === "overdue"   && { overdue: "true" }),
    ...(deadlineFilter === "today"     && { dueToday: "true" }),
    ...(deadlineFilter === "this_week" && { dueThisWeek: "true" }),
    ...(onlyOriginals && { onlyOriginals: "true" }),
    ...(onlyRevisions && { onlyRevisions: "true" }),
  })
  try {
    const { jobs, truncated, total } = await fetch(`/api/jobs?${qs}`).then(r => r.json()) as {
      jobs: Job[]
      truncated?: boolean
      total?: number
    }
    const headers = ["Drawing No.","Address","Type of Works","Custom Type Description","Client","Requested By","Item Type","Status","Designer","Quote Value","Quote Ref","Date Created","Date Completed","Originally Entered As","Notes"]
    const rows = jobs.map(j => [
      j.drawingNumber, j.address, j.typeOfWorks, j.customTypeDescription ?? "", j.clientCompany, j.requestedBy,
      j.itemType ?? "DESIGN", getJobStatus(j.status).label, j.designer,
      j.quoteValue != null ? j.quoteValue.toString() : "",
      j.quoteReference ?? "",
      format(new Date(j.dateCreated), "dd/MM/yyyy"),
      j.dateCompleted ? format(parseLocalDate(j.dateCompleted), "dd/MM/yyyy") : "",
      j.legacyTypeOfWorks ?? "",
      j.notes ?? "",
    ])
    downloadCsv(`oryx-jobs-${format(new Date(), "yyyy-MM-dd")}.csv`, buildCsv(headers, rows))
    toast(
      truncated && total != null
        ? `Exported ${jobs.length} of ${total} jobs (limit reached — narrow filters for a full export)`
        : `Exported ${jobs.length} job${jobs.length !== 1 ? "s" : ""}`,
      truncated ? "info" : "success",
    )
  } catch { toast("Export failed", "error") }
}
