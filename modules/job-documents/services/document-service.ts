import { createId } from "@paralleldrive/cuid2"
import { useSupabaseJobDocuments, isSupabaseOnly } from "@/lib/supabase/feature-flags"
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
import { jobDocumentDb } from "../stores/job-document"
import type {
  JobDocumentListOptions,
  JobDocumentListResult,
  JobDocumentRow,
  UpdateJobDocumentInput,
} from "../types"

function useRemote(): boolean {
  return useSupabaseJobDocuments() || isSupabaseOnly()
}

function resolveCategory(category: string | undefined): string {
  if (category && isValidDocumentCategory(category)) return category
  return "General"
}

export const jobDocumentService = {
  async list(opts: JobDocumentListOptions): Promise<JobDocumentListResult> {
    if (useRemote()) return supabaseJobDocumentRepo.list(opts)
    return jobDocumentDb.list(opts)
  },

  async findUnique(id: string): Promise<JobDocumentRow | null> {
    if (useRemote()) return supabaseJobDocumentRepo.findUnique(id)
    return jobDocumentDb.findUnique(id)
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
    if (!isAllowedUpload(originalFilename, mimeType)) {
      throw Object.assign(new Error("File type is not allowed"), { status: 422 })
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
        date: parsed.date,
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

    const row = useRemote()
      ? await supabaseJobDocumentRepo.create(input)
      : jobDocumentDb.create(input)

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
          // Defer per-file timeline notes; write one batch note below
          timelineJobId: null,
        })
        documents.push(row)
      } catch (err) {
        errors.push({
          name: file.name,
          error: err instanceof Error ? err.message : "Upload failed",
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
    if (useRemote()) return supabaseJobDocumentRepo.update(id, patch)
    return jobDocumentDb.update(id, patch)
  },

  async remove(id: string, actorName: string, timelineJobId?: string | null): Promise<JobDocumentRow | null> {
    const existing = await this.findUnique(id)
    if (!existing || existing.deletedAt) return null

    const deleted = useRemote()
      ? await supabaseJobDocumentRepo.softDelete(id)
      : jobDocumentDb.softDelete(id)

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
