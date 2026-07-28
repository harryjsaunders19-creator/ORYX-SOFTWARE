import { NextRequest, NextResponse } from "next/server"
import { requireSignIn, actorName } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { jobService } from "../services/job-service"
import { resolveDocumentFamily } from "@/modules/job-documents/services/resolve-family"
import { jobDocumentService } from "@/modules/job-documents/services/document-service"
import { buildCat2CheckSheetPdf, cat2ExportFilename } from "../pdf/cat2-check-sheet"
import { historyService } from "../services/history-service"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { id } = await ctx.params
    const family = await resolveDocumentFamily(id)
    if (!family) return NextResponse.json({ error: "Job not found" }, { status: 404 })

    const targetJobId = family.currentRevisionJobId || family.defaultJobId || id
    const job = await jobService.findUnique(targetJobId)
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 })
    if (job.status !== "ISSUED") {
      return NextResponse.json({ error: "CAT II export is only available for completed jobs." }, { status: 409 })
    }

    const pdfBytes = await buildCat2CheckSheetPdf(job)
    const filename = cat2ExportFilename(job.drawingNumber)
    const actor = actorName(auth.user)

    await jobDocumentService.upload({
      rootJobId: family.rootJobId,
      jobId: family.mode === "classic" ? (family.currentRevisionJobId || family.defaultJobId || job.id) : (family.defaultJobId || null),
      parentJobId: family.mode === "parent" ? family.parentJobId : null,
      workItemId: family.mode === "parent" ? family.currentWorkItemId : null,
      revisionLetter: family.currentRevisionLetter,
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
