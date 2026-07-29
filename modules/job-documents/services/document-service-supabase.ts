/**
 * Job documents — Supabase-only path (Vercel / isSupabaseOnly).
 */
import { createId } from "@paralleldrive/cuid2"
import { historyService } from "@/modules/jobs/services/history-service"
import {
  fileExt,
  inferMimeType,
  isAllowedUpload,
  isEmailFile,
  isValidDocumentCategory,
  MAX_JOB_DOC_BYTES,
} from "../constants"
import { parseEmailFile } from "./email-parse"
import { deleteJobFile, readJobFile, writeJobFile } from "./job-files"
import { supabaseJobDocumentRepo } from "../supabase/repository"
import { resolveCategory, sanitizeEmailDate } from "./document-helpers"
import type {
  JobDocumentListOptions,
  JobDocumentListResult,
  JobDocumentRow,
  UpdateJobDocumentInput,
} from "../types"

export const jobDocumentService = {
  async list(opts: JobDocumentListOptions): Promise<JobDocumentListResult> {
    return supabaseJobDocumentRepo.list(opts)
  },

  async findUnique(id: string): Promise<JobDocumentRow | null> {
    return supabaseJobDocumentRepo.findUnique(id)
  },

  async upload(params: {
    rootJobId: string
    jobId?: string | null
    parentJobId?: string | null
    workItemId?: string | null
    revisionLetter?: string | null
    category?: string
    description?: string | null
    file: { name: string; type: string; size: number; buffer: Buffer }
    uploadedBy: string
    uploadedByName: string
    timelineJobId?: string | null
  }): Promise<JobDocumentRow> {
    const originalFilename = params.file.name || "file"
    const mimeType = inferMimeType(originalFilename, params.file.type)
    if (isEmailFile(originalFilename, mimeType)) {
      throw Object.assign(
        new Error("Email files (.msg / .eml) are not supported — print the email to PDF and upload that"),
        { status: 422 },
      )
    }
    if (!isAllowedUpload(originalFilename, mimeType)) {
      throw Object.assign(
        new Error("Only PDF and image files can be uploaded"),
        { status: 422 },
      )
    }
    if (params.file.size > MAX_JOB_DOC_BYTES || params.file.buffer.length > MAX_JOB_DOC_BYTES) {
      throw Object.assign(new Error("File exceeds 50 MB limit"), { status: 422 })
    }
    if (!params.jobId && !params.parentJobId) {
      throw Object.assign(new Error("Document must attach to a job or parent job"), { status: 422 })
    }

    const id = createId()
    const ext = fileExt(originalFilename)
    const category = resolveCategory(params.category)

    let emailMeta = {
      subject: null as string | null,
      from: null as string | null,
      to: null as string | null,
      cc: null as string | null,
      date: null as string | null,
      preview: null as string | null,
      parseStatus: "none" as "none" | "ok" | "failed",
    }
    if (isEmailFile(originalFilename, mimeType)) {
      const parsed = await parseEmailFile(originalFilename, mimeType, params.file.buffer)
      emailMeta = {
        subject: parsed.subject,
        from: parsed.from,
        to: parsed.to,
        cc: parsed.cc,
        date: sanitizeEmailDate(parsed.date),
        preview: parsed.preview,
        parseStatus: parsed.ok ? "ok" : "failed",
      }
    }

    const storagePath = await writeJobFile({
      rootJobId: params.rootJobId,
      docId: id,
      filename: originalFilename,
      revisionLetter: params.revisionLetter,
      data: params.file.buffer,
      contentType: mimeType,
    })

    const input = {
      id,
      rootJobId: params.rootJobId,
      jobId: params.jobId ?? null,
      parentJobId: params.parentJobId ?? null,
      workItemId: params.workItemId ?? null,
      revisionLetter: params.revisionLetter ?? null,
      filename: originalFilename.replace(/[^a-zA-Z0-9._\-\s()[\]]+/g, "_").slice(0, 180) || originalFilename,
      originalFilename,
      mimeType,
      fileExt: ext,
      fileSize: params.file.buffer.length,
      category,
      description: params.description?.trim() || null,
      storagePath,
      uploadedBy: params.uploadedBy,
      uploadedByName: params.uploadedByName,
      emailSubject: emailMeta.subject,
      emailFrom: emailMeta.from,
      emailTo: emailMeta.to,
      emailCc: emailMeta.cc,
      emailDate: emailMeta.date,
      emailPreview: emailMeta.preview,
      parseStatus: emailMeta.parseStatus,
    }

    const row = await supabaseJobDocumentRepo.create(input)

    const timelineId = params.timelineJobId || params.jobId || params.rootJobId
    if (timelineId) {
      try {
        await historyService.addNote(
          timelineId,
          `${params.uploadedByName} uploaded ${row.filename}`,
          params.uploadedByName,
        )
      } catch { /* non-fatal */ }
    }

    return row
  },

  async uploadMany(params: {
    rootJobId: string
    jobId?: string | null
    parentJobId?: string | null
    workItemId?: string | null
    revisionLetter?: string | null
    category?: string
    description?: string | null
    files: Array<{ name: string; type: string; size: number; buffer: Buffer }>
    uploadedBy: string
    uploadedByName: string
    timelineJobId?: string | null
  }): Promise<{ documents: JobDocumentRow[]; errors: Array<{ name: string; error: string }> }> {
    const documents: JobDocumentRow[] = []
    const errors: Array<{ name: string; error: string }> = []

    for (const file of params.files) {
      try {
        const row = await this.upload({
          ...params,
          file,
          timelineJobId: null,
        })
        documents.push(row)
      } catch (err) {
        const message = err instanceof Error
          ? err.message
          : err && typeof err === "object" && "message" in err
            ? String((err as { message: unknown }).message)
            : "Upload failed"
        errors.push({
          name: file.name,
          error: message || "Upload failed",
        })
      }
    }

    const timelineId = params.timelineJobId || params.jobId || params.rootJobId
    if (timelineId && documents.length > 0) {
      try {
        const note = documents.length === 1
          ? `${params.uploadedByName} uploaded ${documents[0].filename}`
          : `${params.uploadedByName} uploaded ${documents.length} documents`
        await historyService.addNote(timelineId, note, params.uploadedByName)
      } catch { /* non-fatal */ }
    }

    return { documents, errors }
  },

  async update(id: string, patch: UpdateJobDocumentInput): Promise<JobDocumentRow | null> {
    if (patch.category && !isValidDocumentCategory(patch.category)) {
      throw Object.assign(new Error("Invalid category"), { status: 422 })
    }
    return supabaseJobDocumentRepo.update(id, patch)
  },

  async remove(id: string, actorName: string, timelineJobId?: string | null): Promise<JobDocumentRow | null> {
    const existing = await this.findUnique(id)
    if (!existing || existing.deletedAt) return null

    const deleted = await supabaseJobDocumentRepo.softDelete(id)

    try {
      await deleteJobFile(existing.storagePath)
    } catch { /* non-fatal */ }

    const timelineId = timelineJobId || existing.jobId || existing.rootJobId
    if (timelineId) {
      try {
        await historyService.addNote(
          timelineId,
          `${actorName} deleted ${existing.filename}`,
          actorName,
        )
      } catch { /* non-fatal */ }
    }
    return deleted
  },

  async download(id: string): Promise<{ row: JobDocumentRow; buffer: Buffer } | null> {
    const row = await this.findUnique(id)
    if (!row || row.deletedAt) return null
    const buffer = await readJobFile(row.storagePath)
    if (!buffer) return null
    return { row, buffer }
  },
}
