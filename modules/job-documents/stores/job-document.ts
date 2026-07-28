/** SQLite fallback for job documents (local hybrid / offline). */
import { db } from "@/lib/db/connection"
import { nowIso } from "@/lib/db/helpers"
import { documentKind } from "../constants"
import type {
  CreateJobDocumentInput,
  JobDocumentListOptions,
  JobDocumentListResult,
  JobDocumentRow,
  ParseStatus,
  UpdateJobDocumentInput,
} from "../types"

function mapRow(raw: Record<string, unknown>): JobDocumentRow {
  const parseStatus = (["none", "ok", "failed"].includes(String(raw.parseStatus))
    ? String(raw.parseStatus)
    : "none") as ParseStatus
  return {
    id: String(raw.id),
    rootJobId: String(raw.rootJobId),
    jobId: (raw.jobId as string) ?? null,
    parentJobId: (raw.parentJobId as string) ?? null,
    workItemId: (raw.workItemId as string) ?? null,
    revisionLetter: (raw.revisionLetter as string) ?? null,
    filename: String(raw.filename),
    originalFilename: String(raw.originalFilename),
    mimeType: String(raw.mimeType),
    fileExt: String(raw.fileExt ?? ""),
    fileSize: Number(raw.fileSize) || 0,
    category: String(raw.category),
    description: (raw.description as string) ?? null,
    storagePath: String(raw.storagePath),
    uploadedBy: String(raw.uploadedBy),
    uploadedByName: String(raw.uploadedByName),
    emailSubject: (raw.emailSubject as string) ?? null,
    emailFrom: (raw.emailFrom as string) ?? null,
    emailTo: (raw.emailTo as string) ?? null,
    emailCc: (raw.emailCc as string) ?? null,
    emailDate: (raw.emailDate as string) ?? null,
    emailPreview: (raw.emailPreview as string) ?? null,
    parseStatus,
    versionGroupId: (raw.versionGroupId as string) ?? null,
    approvalStatus: (raw.approvalStatus as string) ?? null,
    createdAt: String(raw.createdAt),
    updatedAt: String(raw.updatedAt),
    deletedAt: (raw.deletedAt as string) ?? null,
  }
}

export const jobDocumentDb = {
  findUnique(id: string): JobDocumentRow | null {
    const row = db.prepare("SELECT * FROM JobDocument WHERE id = ?").get(id) as Record<string, unknown> | undefined
    return row ? mapRow(row) : null
  },

  list(opts: JobDocumentListOptions): JobDocumentListResult {
    const page = Math.max(1, opts.page ?? 1)
    const limit = Math.min(Math.max(opts.limit ?? 24, 1), 100)
    const rootIds = [...new Set([opts.rootJobId, ...(opts.rootJobIds ?? [])].filter(Boolean))]
    const clauses: string[] = []
    const params: unknown[] = []
    if (opts.parentJobId && rootIds.length > 1) {
      const placeholders = rootIds.map(() => "?").join(",")
      clauses.push(`(rootJobId IN (${placeholders}) OR parentJobId = ?)`)
      params.push(...rootIds, opts.parentJobId)
    } else if (rootIds.length > 1) {
      const placeholders = rootIds.map(() => "?").join(",")
      clauses.push(`rootJobId IN (${placeholders})`)
      params.push(...rootIds)
    } else {
      clauses.push("rootJobId = ?")
      params.push(opts.rootJobId)
    }
    if (!opts.includeDeleted) clauses.push("deletedAt IS NULL")
    if (opts.category) {
      clauses.push("category = ?")
      params.push(opts.category)
    }
    if (opts.scope === "current") {
      if (opts.currentWorkItemId) {
        clauses.push("workItemId = ?")
        params.push(opts.currentWorkItemId)
      } else if (opts.currentJobId) {
        clauses.push("jobId = ?")
        params.push(opts.currentJobId)
      } else {
        clauses.push("revisionLetter IS NULL")
      }
    } else if (opts.scope === "previous") {
      if (opts.currentWorkItemId) {
        clauses.push("workItemId IS NOT NULL AND workItemId != ?")
        params.push(opts.currentWorkItemId)
      } else if (opts.currentJobId) {
        clauses.push("revisionLetter IS NOT NULL AND jobId != ?")
        params.push(opts.currentJobId)
      } else {
        clauses.push("revisionLetter IS NOT NULL")
      }
    }
    if (opts.revisionJobId) {
      clauses.push("jobId = ?")
      params.push(opts.revisionJobId)
    }
    if (opts.workItemId) {
      clauses.push("workItemId = ?")
      params.push(opts.workItemId)
    }
    if (opts.period && opts.period !== "all") {
      const d = new Date()
      if (opts.period === "today") d.setHours(0, 0, 0, 0)
      else if (opts.period === "week") d.setDate(d.getDate() - 7)
      else if (opts.period === "month") d.setMonth(d.getMonth() - 1)
      clauses.push("createdAt >= ?")
      params.push(d.toISOString())
    }
    if (opts.q?.trim()) {
      const s = `%${opts.q.trim()}%`
      clauses.push(`(
        filename LIKE ? OR originalFilename LIKE ? OR description LIKE ? OR category LIKE ?
        OR uploadedByName LIKE ? OR emailSubject LIKE ? OR emailFrom LIKE ? OR emailTo LIKE ?
      )`)
      params.push(s, s, s, s, s, s, s, s)
    }

    const where = `WHERE ${clauses.join(" AND ")}`
    let rows = (db.prepare(`SELECT * FROM JobDocument ${where} ORDER BY createdAt DESC`).all(...params) as Record<string, unknown>[])
      .map(mapRow)
    if (opts.kind) {
      rows = rows.filter(r => documentKind(r.mimeType, r.fileExt) === opts.kind)
    }
    const total = rows.length
    const from = (page - 1) * limit
    return {
      documents: rows.slice(from, from + limit),
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    }
  },

  create(input: CreateJobDocumentInput): JobDocumentRow {
    const now = nowIso()
    db.prepare(`
      INSERT INTO JobDocument (
        id, rootJobId, jobId, parentJobId, workItemId, revisionLetter,
        filename, originalFilename, mimeType, fileExt, fileSize, category, description,
        storagePath, uploadedBy, uploadedByName,
        emailSubject, emailFrom, emailTo, emailCc, emailDate, emailPreview, parseStatus,
        createdAt, updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      input.id, input.rootJobId, input.jobId ?? null, input.parentJobId ?? null,
      input.workItemId ?? null, input.revisionLetter ?? null,
      input.filename, input.originalFilename, input.mimeType, input.fileExt, input.fileSize,
      input.category, input.description ?? null, input.storagePath,
      input.uploadedBy, input.uploadedByName,
      input.emailSubject ?? null, input.emailFrom ?? null, input.emailTo ?? null,
      input.emailCc ?? null, input.emailDate ?? null, input.emailPreview ?? null,
      input.parseStatus ?? "none", now, now,
    )
    return this.findUnique(input.id)!
  },

  update(id: string, patch: UpdateJobDocumentInput): JobDocumentRow | null {
    const existing = this.findUnique(id)
    if (!existing || existing.deletedAt) return null
    db.prepare(`
      UPDATE JobDocument SET
        filename = ?, category = ?, description = ?,
        jobId = ?, workItemId = ?, revisionLetter = ?, updatedAt = ?
      WHERE id = ?
    `).run(
      patch.filename ?? existing.filename,
      patch.category ?? existing.category,
      patch.description !== undefined ? patch.description : existing.description,
      patch.jobId !== undefined ? patch.jobId : existing.jobId,
      patch.workItemId !== undefined ? patch.workItemId : existing.workItemId,
      patch.revisionLetter !== undefined ? patch.revisionLetter : existing.revisionLetter,
      nowIso(),
      id,
    )
    return this.findUnique(id)
  },

  softDelete(id: string): JobDocumentRow | null {
    const existing = this.findUnique(id)
    if (!existing || existing.deletedAt) return null
    const now = nowIso()
    db.prepare("UPDATE JobDocument SET deletedAt = ?, updatedAt = ? WHERE id = ?").run(now, now, id)
    return this.findUnique(id)
  },
}
