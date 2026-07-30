import { NextRequest, NextResponse } from "next/server"
import { requireModuleAccess, actorName } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { jobService } from "../services/job-service"
import { parentJobService } from "../services/parent-work-item-service"
import { resolveDocumentFamily } from "@/modules/job-documents/services/resolve-family"
import { jobDocumentService } from "@/modules/job-documents/services/document-service"
import { buildCat2CheckSheetPdf, cat2ExportFilename } from "../pdf/cat2-check-sheet"
import { historyService } from "../services/history-service"
import type { JobRow } from "../types/job-types"
import type { ParentJobRow } from "../types/parent-job-types"
import type { DesignWorkItemRow } from "../types/design-work-item-types"

type Ctx = { params: Promise<{ id: string }> }

function pickCompletedWorkItem(
  workItems: DesignWorkItemRow[],
  preferredId: string | null,
): DesignWorkItemRow | null {
  if (preferredId) {
    const preferred = workItems.find(w => w.id === preferredId && w.status === "ISSUED")
    if (preferred) return preferred
  }
  const completed = workItems
    .filter(w => w.status === "ISSUED")
    .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt))
  return completed[0] ?? null
}

function jobFromParentAndWorkItem(
  parent: ParentJobRow,
  workItem: DesignWorkItemRow,
  legacy: JobRow | null,
): JobRow {
  const now = new Date().toISOString()
  return {
    id: legacy?.id ?? workItem.legacyJobId ?? parent.legacyJobId ?? parent.id,
    drawingNumber: parent.drawingNumber,
    itemType: parent.itemType || "DESIGN",
    address: parent.address,
    siteId: parent.siteId ?? null,
    locationMode: parent.siteId ? "MANAGED_SITE" : "ONE_OFF",
    locationName: parent.locationName ?? parent.siteName ?? null,
    postcode: parent.postcode ?? null,
    siteName: parent.siteName,
    siteAddress: parent.siteAddress,
    typeOfWorks: parent.typeOfWorks,
    customTypeDescription: parent.customTypeDescription,
    legacyTypeOfWorks: parent.legacyTypeOfWorks,
    clientCompany: parent.clientCompany,
    clientId: parent.clientId,
    requestedBy: parent.requestedBy,
    status: "ISSUED",
    designer: workItem.designer || legacy?.designer || "",
    dateCreated: workItem.dateCreated || parent.createdAt,
    dateCompleted: workItem.completedAt ?? legacy?.dateCompleted ?? null,
    notes: workItem.notes ?? legacy?.notes ?? null,
    designStandards: legacy?.designStandards ?? null,
    tags: parent.tags ?? legacy?.tags ?? [],
    quoteValue: workItem.quoteValue ?? legacy?.quoteValue ?? null,
    quoteReference: workItem.quoteReference ?? legacy?.quoteReference ?? null,
    quoteDate: workItem.quoteDate ?? legacy?.quoteDate ?? null,
    commercialNotes: workItem.commercialNotes ?? legacy?.commercialNotes ?? null,
    variationFees: workItem.variationFees ?? legacy?.variationFees ?? null,
    additionalCharges: workItem.additionalCharges ?? legacy?.additionalCharges ?? null,
    invoiceId: legacy?.invoiceId ?? null,
    billingStatus: legacy?.billingStatus ?? null,
    billingBatchId: legacy?.billingBatchId ?? null,
    requestedDate: workItem.requestedDate ?? legacy?.requestedDate ?? null,
    requiredByDate: workItem.requiredByDate ?? legacy?.requiredByDate ?? null,
    parentJobId: null,
    revisionLetter: workItem.revisionLetter,
    billable: workItem.billable,
    archivedAt: parent.archivedAt,
    archivedBy: parent.archivedBy,
    latitude: parent.latitude,
    longitude: parent.longitude,
    geocodedAt: parent.geocodedAt,
    geocodedAddress: parent.geocodedAddress,
    locationStatus: parent.locationStatus,
    locationSource: parent.locationSource,
    createdAt: parent.createdAt || now,
    updatedAt: workItem.updatedAt || now,
  }
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireModuleAccess("jobs")
    if (auth instanceof NextResponse) return auth

    const { id } = await ctx.params
    const family = await resolveDocumentFamily(id)
    if (!family) return NextResponse.json({ error: "Job not found" }, { status: 404 })

    let job: JobRow | null = null

    if (family.mode === "parent" && family.parentJobId) {
      const dash = await parentJobService.getDashboard(family.parentJobId)
      if (!dash?.parent) return NextResponse.json({ error: "Job not found" }, { status: 404 })

      const workItem = pickCompletedWorkItem(dash.workItems, family.currentWorkItemId)
      if (!workItem) {
        return NextResponse.json({ error: "CAT II export is only available for completed jobs." }, { status: 409 })
      }

      const legacyId = workItem.legacyJobId || dash.parent.legacyJobId || family.defaultJobId
      const legacy = legacyId ? await jobService.findUnique(legacyId) : null
      job = jobFromParentAndWorkItem(dash.parent, workItem, legacy)

      if (!job.designStandards && family.defaultJobId && family.defaultJobId !== legacyId) {
        const fallback = await jobService.findUnique(family.defaultJobId)
        if (fallback?.designStandards) job = { ...job, designStandards: fallback.designStandards }
      }
    } else {
      const targetJobId = family.currentRevisionJobId || family.defaultJobId || id
      job = await jobService.findUnique(targetJobId)
      if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 })
      if (job.status !== "ISSUED") {
        return NextResponse.json({ error: "CAT II export is only available for completed jobs." }, { status: 409 })
      }

      if (!job.designStandards) {
        const fallbackId = family.defaultJobId || family.rootJobId
        if (fallbackId && fallbackId !== job.id) {
          const source = await jobService.findUnique(fallbackId)
          if (source?.designStandards) {
            job = { ...job, designStandards: source.designStandards }
          }
        }
      }
    }

    const pdfBytes = await buildCat2CheckSheetPdf(job)
    const filename = cat2ExportFilename(job.drawingNumber)
    const actor = actorName(auth.user)

    await jobDocumentService.upload({
      rootJobId: family.rootJobId,
      jobId: family.mode === "classic" ? (family.currentRevisionJobId || family.defaultJobId || job.id) : (family.defaultJobId || null),
      parentJobId: family.mode === "parent" ? family.parentJobId : null,
      workItemId: family.mode === "parent" ? family.currentWorkItemId : null,
      revisionLetter: family.currentRevisionLetter ?? job.revisionLetter,
      category: "Design",
      description: "CAT II Temporary Works Design Check Sheet",
      file: {
        name: filename,
        type: "application/pdf",
        size: pdfBytes.byteLength,
        buffer: Buffer.from(pdfBytes),
      },
      uploadedBy: auth.user.id,
      uploadedByName: actor,
      timelineJobId: family.timelineJobId,
    })

    await historyService.addNote(
      family.timelineJobId,
      `${actor} generated CAT II Check Sheet (${job.drawingNumber})`,
      actor,
    )

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    return apiInternalError("jobs.api.cat2_check_sheet", err)
  }
}
