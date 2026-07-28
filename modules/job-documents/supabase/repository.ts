import { createAdminClient } from "@/lib/supabase/admin"
import { escapePostgrestFilterValue } from "@/shared/supabase/postgrest-filter"
import { documentKind } from "../constants"
import type {
  CreateJobDocumentInput,
  JobDocumentListOptions,
  JobDocumentListResult,
  JobDocumentRow,
  UpdateJobDocumentInput,
} from "../types"
import { toJobDocumentRow, toSupabaseJobDocument, type SupabaseJobDocumentRow } from "./mapper"
import { nowIso } from "@/lib/db/helpers"

const COLS = [
  "id", "root_job_id", "job_id", "parent_job_id", "work_item_id", "revision_letter",
  "filename", "original_filename", "mime_type", "file_ext", "file_size", "category",
  "description", "storage_path", "uploaded_by", "uploaded_by_name",
  "email_subject", "email_from", "email_to", "email_cc", "email_date", "email_preview",
  "parse_status", "version_group_id", "approval_status",
  "created_at", "updated_at", "deleted_at",
].join(",")

function table() {
  return createAdminClient().from("job_documents")
}

function periodStart(period: JobDocumentListOptions["period"]): string | null {
  if (!period || period === "all") return null
  const d = new Date()
  if (period === "today") {
    d.setHours(0, 0, 0, 0)
  } else if (period === "week") {
    d.setDate(d.getDate() - 7)
  } else if (period === "month") {
    d.setMonth(d.getMonth() - 1)
  }
  return d.toISOString()
}

function matchesKind(row: JobDocumentRow, kind: NonNullable<JobDocumentListOptions["kind"]>): boolean {
  return documentKind(row.mimeType, row.fileExt) === kind
}

export const supabaseJobDocumentRepo = {
  async findUnique(id: string): Promise<JobDocumentRow | null> {
    const { data, error } = await table().select(COLS).eq("id", id).maybeSingle()
    if (error) throw new Error(error.message)
    return data ? toJobDocumentRow(data as unknown as SupabaseJobDocumentRow) : null
  },

  async list(opts: JobDocumentListOptions): Promise<JobDocumentListResult> {
    const page = Math.max(1, opts.page ?? 1)
    const limit = Math.min(Math.max(opts.limit ?? 24, 1), 100)
    const from = (page - 1) * limit
    const to = from + limit - 1

    let q = table().select(COLS, { count: "exact" })
    const rootIds = [...new Set([opts.rootJobId, ...(opts.rootJobIds ?? [])].filter(Boolean))]
    if (opts.parentJobId) {
      // Parent family may store docs under parent id or legacy job id.
      const rootList = rootIds.join(",")
      q = q.or(`root_job_id.in.(${rootList}),parent_job_id.eq.${opts.parentJobId}`)
    } else if (rootIds.length > 1) {
      q = q.in("root_job_id", rootIds)
    } else {
      q = q.eq("root_job_id", opts.rootJobId)
    }
    if (!opts.includeDeleted) q = q.is("deleted_at", null)

    if (opts.category) q = q.eq("category", opts.category)

    if (opts.scope === "current") {
      if (opts.currentWorkItemId) q = q.eq("work_item_id", opts.currentWorkItemId)
      else if (opts.currentJobId) q = q.eq("job_id", opts.currentJobId)
      else q = q.is("revision_letter", null)
    } else if (opts.scope === "previous") {
      if (opts.currentWorkItemId) {
        q = q.not("work_item_id", "is", null).neq("work_item_id", opts.currentWorkItemId)
      } else if (opts.currentJobId) {
        q = q.not("revision_letter", "is", null)
        // Exclude current revision job if known
        q = q.neq("job_id", opts.currentJobId)
      } else {
        q = q.not("revision_letter", "is", null)
      }
    }

    if (opts.revisionJobId) q = q.eq("job_id", opts.revisionJobId)
    if (opts.workItemId) q = q.eq("work_item_id", opts.workItemId)

    const since = periodStart(opts.period)
    if (since) q = q.gte("created_at", since)

    if (opts.q?.trim()) {
      const term = escapePostgrestFilterValue(opts.q.trim())
      if (term) {
        q = q.or(
          [
            `filename.ilike.%${term}%`,
            `original_filename.ilike.%${term}%`,
            `description.ilike.%${term}%`,
            `category.ilike.%${term}%`,
            `uploaded_by_name.ilike.%${term}%`,
            `email_subject.ilike.%${term}%`,
            `email_from.ilike.%${term}%`,
            `email_to.ilike.%${term}%`,
          ].join(","),
        )
      }
    }

    // Kind filter is applied client-side after fetch when PostgREST can't express
    // extension sets cleanly — fetch a larger window then page in-memory when kind set.
    const needsKindFilter = Boolean(opts.kind)
    if (needsKindFilter) {
      q = q.order("created_at", { ascending: false }).limit(500)
    } else {
      q = q.order("created_at", { ascending: false }).range(from, to)
    }

    const { data, error, count } = await q
    if (error) throw new Error(error.message)

    let rows = ((data ?? []) as unknown as SupabaseJobDocumentRow[]).map(toJobDocumentRow)
    if (opts.kind) {
      rows = rows.filter(r => matchesKind(r, opts.kind!))
      const total = rows.length
      const pageRows = rows.slice(from, from + limit)
      return {
        documents: pageRows,
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit)),
      }
    }

    return {
      documents: rows,
      total: count ?? rows.length,
      page,
      limit,
      pages: Math.max(1, Math.ceil((count ?? rows.length) / limit)),
    }
  },

  async create(input: CreateJobDocumentInput): Promise<JobDocumentRow> {
    const now = nowIso()
    const row: JobDocumentRow = {
      id: input.id,
      rootJobId: input.rootJobId,
      jobId: input.jobId ?? null,
      parentJobId: input.parentJobId ?? null,
      workItemId: input.workItemId ?? null,
      revisionLetter: input.revisionLetter ?? null,
      filename: input.filename,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      fileExt: input.fileExt,
      fileSize: input.fileSize,
      category: input.category,
      description: input.description ?? null,
      storagePath: input.storagePath,
      uploadedBy: input.uploadedBy,
      uploadedByName: input.uploadedByName,
      emailSubject: input.emailSubject ?? null,
      emailFrom: input.emailFrom ?? null,
      emailTo: input.emailTo ?? null,
      emailCc: input.emailCc ?? null,
      emailDate: input.emailDate ?? null,
      emailPreview: input.emailPreview ?? null,
      parseStatus: input.parseStatus ?? "none",
      versionGroupId: null,
      approvalStatus: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    const { data, error } = await table()
      .upsert(toSupabaseJobDocument(row), { onConflict: "id" })
      .select(COLS)
      .single()
    if (error) throw new Error(error.message)
    return toJobDocumentRow(data as unknown as SupabaseJobDocumentRow)
  },

  async update(id: string, patch: UpdateJobDocumentInput): Promise<JobDocumentRow | null> {
    const existing = await this.findUnique(id)
    if (!existing || existing.deletedAt) return null
    const next: JobDocumentRow = {
      ...existing,
      filename: patch.filename ?? existing.filename,
      category: patch.category ?? existing.category,
      description: patch.description !== undefined ? patch.description : existing.description,
      jobId: patch.jobId !== undefined ? patch.jobId : existing.jobId,
      workItemId: patch.workItemId !== undefined ? patch.workItemId : existing.workItemId,
      revisionLetter: patch.revisionLetter !== undefined ? patch.revisionLetter : existing.revisionLetter,
      updatedAt: nowIso(),
    }
    const { data, error } = await table()
      .upsert(toSupabaseJobDocument(next), { onConflict: "id" })
      .select(COLS)
      .single()
    if (error) throw new Error(error.message)
    return toJobDocumentRow(data as unknown as SupabaseJobDocumentRow)
  },

  async softDelete(id: string): Promise<JobDocumentRow | null> {
    const existing = await this.findUnique(id)
    if (!existing || existing.deletedAt) return null
    const next: JobDocumentRow = {
      ...existing,
      deletedAt: nowIso(),
      updatedAt: nowIso(),
    }
    const { data, error } = await table()
      .upsert(toSupabaseJobDocument(next), { onConflict: "id" })
      .select(COLS)
      .single()
    if (error) throw new Error(error.message)
    return toJobDocumentRow(data as unknown as SupabaseJobDocumentRow)
  },
}
