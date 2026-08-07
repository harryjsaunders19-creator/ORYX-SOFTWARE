/**
 * POST /api/jobs/import
 *
 * Two modes, selected by Content-Type:
 *
 *   1. multipart/form-data with a "file" field
 *      → Parses the file, returns the preview (headers, mapping, parsed rows).
 *        Nothing is saved to the database yet.
 *
 *   2. application/json with { rows: ParsedImportRow[], mode: "commit" }
 *      → Bulk-inserts the validated rows into the database, assigns drawing
 *        numbers, links clients, and returns the result summary.
 *
 * Auth: requires sign-in (any role).
 */
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { apiInternalError } from "@/shared/api-errors"
import { logError } from "@/shared/logger"

import { requireFullAccess } from "@/shared/auth/auth"
import { jobService } from "../services/job-service"
import { clientService } from "@/modules/clients"
import { allocateDrawingNumberAsync, nextRefNumberAsync } from "@/shared/supabase/sequence-service"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"
import { createId } from "@paralleldrive/cuid2"
import { isValidWorksType, OTHER_WORKS_TYPE, VALID_STATUSES, REF_PREFIX_BY_ITEM_TYPE } from "@/lib/constants"
import { resolveRequiredByDate } from "@/shared/utils/utils"
import {
  parseSpreadsheet,
  markInternalDuplicates,
  dedupKey,
  type ParsedImportRow,
} from "../import/import-jobs"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const MAX_ROWS = 5000

const REF_PREFIXES = REF_PREFIX_BY_ITEM_TYPE

const spreadsheetUploadSchema = z.custom<File>(
  (value) => {
    if (!value || typeof value !== "object") return false
    const v = value as Record<string, unknown>
    return typeof v.name === "string" && typeof v.arrayBuffer === "function" && typeof v.size === "number"
  },
  "No file provided",
)

const commitImportBodySchema = z.object({
  mode: z.literal("commit"),
  rows: z.array(z.object({
    rowIndex: z.number().int().optional(),
    itemType: z.string().optional(),
    address: z.string().optional(),
    clientCompany: z.string().optional(),
    requestedBy: z.string().optional(),
    typeOfWorks: z.string().optional(),
    customTypeDescription: z.string().optional(),
    status: z.string().optional(),
    designer: z.string().optional(),
    dateCompleted: z.union([z.string(), z.null()]).optional(),
    notes: z.string().optional(),
    quoteValue: z.number().nullable().optional(),
    quoteReference: z.string().optional(),
    quoteDate: z.union([z.string(), z.null()]).optional(),
    commercialNotes: z.string().optional(),
    requestedDate: z.union([z.string(), z.null()]).optional(),
    requiredByDate: z.union([z.string(), z.null()]).optional(),
    errors: z.array(z.string()).optional(),
    warnings: z.array(z.string()).optional(),
  }).passthrough()),
}).passthrough()

export async function POST(req: NextRequest) {
  try {
    const auth = await requireFullAccess()
    if (auth instanceof NextResponse) return auth
    const user = auth.user

    const { checkRateLimit, rateLimitedResponse, RATE_PRESETS } = await import("@/shared/auth/rate-limit")
    if (!(await checkRateLimit(`import:${user.id}`, RATE_PRESETS.import))) {
      return rateLimitedResponse(3600)
    }

    const contentType = req.headers.get("content-type") ?? ""

    // ── Mode 1: File upload → parse & preview ──────────────────────
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData()
      const fileParsed = spreadsheetUploadSchema.safeParse(formData.get("file"))
      if (!fileParsed.success) {
        return NextResponse.json({ error: fileParsed.error.issues[0]?.message ?? "No file provided" }, { status: 400 })
      }
      const file = fileParsed.data

      const ext = file.name.toLowerCase().split(".").pop()
      if (!ext || !["csv", "xlsx", "xls"].includes(ext)) {
        return NextResponse.json({ error: "Only .csv and .xlsx files are supported" }, { status: 422 })
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024} MB)` }, { status: 422 })
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      const result = await parseSpreadsheet(buffer, file.name)

      if (result.rows.length === 0) {
        return NextResponse.json({ error: "No data rows found in file" }, { status: 422 })
      }

      if (result.rows.length > MAX_ROWS) {
        return NextResponse.json({ error: `Too many rows (${result.rows.length}). Maximum is ${MAX_ROWS}.` }, { status: 422 })
      }

      // Check for duplicates within the import
      markInternalDuplicates(result.rows)

      // Check for duplicates against existing database jobs
      const existingJobs = await jobService.findMany({ take: 10000 })
      const existingKeys = new Set(existingJobs.map(j => dedupKey({
        address: j.address,
        clientCompany: j.clientCompany,
        typeOfWorks: j.typeOfWorks,
      })))

      for (const row of result.rows) {
        if (row.errors.length > 0) continue
        const key = dedupKey(row)
        if (existingKeys.has(key)) {
          row.warnings.push("A job with the same address, client, and type of works already exists")
        }
      }

      const requiredFieldsMissing = !result.mapping || (
        !Object.values(result.mapping).includes("address") ||
        !Object.values(result.mapping).includes("clientCompany") ||
        !Object.values(result.mapping).includes("requestedBy")
      )

      return NextResponse.json({
        preview: true,
        filename: file.name,
        headers: result.headers,
        mapping: result.mapping,
        unmappedHeaders: result.unmappedHeaders,
        rows: result.rows,
        totalRawRows: result.totalRawRows,
        requiredFieldsMissing,
        summary: {
          total: result.rows.length,
          valid: result.rows.filter(r => r.errors.length === 0).length,
          errors: result.rows.filter(r => r.errors.length > 0).length,
          warnings: result.rows.filter(r => r.warnings.length > 0).length,
        },
      })
    }

    // ── Mode 2: Commit parsed rows to database ─────────────────────
    if (contentType.includes("application/json")) {
      let bodyRaw: unknown
      try { bodyRaw = await req.json() }
      catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
      const parsedBody = commitImportBodySchema.safeParse(bodyRaw)
      if (!parsedBody.success) {
        return NextResponse.json({ error: "Expected { mode: 'commit', rows: [...] }" }, { status: 400 })
      }
      const rows = parsedBody.data.rows as ParsedImportRow[]
      if (rows.length > MAX_ROWS) {
        return NextResponse.json({ error: `Too many rows (${rows.length})` }, { status: 422 })
      }

      const changedBy = user.name
      const imported: { drawingNumber: string; address: string; clientCompany: string }[] = []
      const skipped: { rowIndex: number; reasons: string[] }[] = []

      for (const row of rows) {
        // Re-validate on the server (client could have tampered)
        const reasons: string[] = []
        if (!row.address?.trim()) reasons.push("Missing address")
        if (!row.clientCompany?.trim()) reasons.push("Missing client")
        if (!row.requestedBy?.trim()) reasons.push("Missing requested by")

        const itemType = row.itemType || "DESIGN"
        if (itemType === "DESIGN") {
          if (!row.typeOfWorks?.trim()) {
            reasons.push("Missing type of works")
          } else if (!isValidWorksType(row.typeOfWorks) && row.typeOfWorks !== OTHER_WORKS_TYPE) {
            reasons.push(`Invalid type of works: "${row.typeOfWorks}"`)
          }
          if (row.typeOfWorks === OTHER_WORKS_TYPE && !row.customTypeDescription?.trim()) {
            reasons.push("Other type requires a description")
          }
        }

        if (row.status && !VALID_STATUSES.includes(row.status as never)) {
          reasons.push(`Invalid status: "${row.status}"`)
        }

        if (reasons.length > 0) {
          skipped.push({ rowIndex: row.rowIndex, reasons })
          continue
        }

        // Generate drawing number
        let drawingNumber: string
        if (itemType === "DESIGN") {
          drawingNumber = await allocateDrawingNumberAsync()
        } else if (itemType === "REVISION") {
          skipped.push({ rowIndex: row.rowIndex, reasons: ["Revisions cannot be imported — use the revision creation flow"] })
          continue
        } else {
          const prefix = REF_PREFIXES[itemType]
          if (!prefix) {
            skipped.push({ rowIndex: row.rowIndex, reasons: [`Unknown item type: "${itemType}"`] })
            continue
          }
          drawingNumber = await nextRefNumberAsync(prefix)
        }

        // Resolve client
        let resolvedClientId: string | null = null
        const resolvedClientCompany = row.clientCompany.trim()
        const client = await clientService.findByName(resolvedClientCompany)
        if (client) resolvedClientId = client.id

        const quoteValue = row.quoteValue != null && row.quoteValue >= 0
          ? Math.round(row.quoteValue * 100) / 100 : null

        try {
          await jobService.create({
            id: createId(),
            drawingNumber,
            itemType,
            address: row.address.trim(),
            typeOfWorks: row.typeOfWorks || "",
            customTypeDescription: row.typeOfWorks === OTHER_WORKS_TYPE
              ? (row.customTypeDescription?.trim() || null) : null,
            clientCompany: resolvedClientCompany,
            clientId: resolvedClientId,
            requestedBy: row.requestedBy.trim(),
            status: row.status || "NEW_REQUEST",
            designer: row.designer?.trim() || "",
            dateCompleted: row.dateCompleted || null,
            notes: row.notes?.trim() || null,
            quoteValue,
            quoteReference: row.quoteReference?.trim() || null,
            quoteDate: row.quoteDate || null,
            commercialNotes: row.commercialNotes?.trim() || null,
            requestedDate: row.requestedDate || null,
            requiredByDate: resolveRequiredByDate(row.requiredByDate),
            parentJobId: null,
            revisionLetter: null,
            changedBy,
          })
          imported.push({ drawingNumber, address: row.address, clientCompany: resolvedClientCompany })
        } catch (err) {
          logError("jobs.api.import.row", err, { rowIndex: row.rowIndex })
          skipped.push({ rowIndex: row.rowIndex, reasons: ["Database error"] })
        }
      }

      // Reconcile sequence counters after import — a safety net that
      // ensures the DrawingSequence/RefSequence counters are at least as
      // high as the highest drawing number now in the database, so the
      // next manually created job continues the sequence correctly even
      // if something unexpected happened during the bulk insert.
      if (imported.length > 0 && !isSupabaseOnly()) {
        const { sequenceDb } = await import("@/lib/db")
        sequenceDb.syncFromExistingJobs()
      }

      const nextDrawingNumber = await (await import("@/shared/supabase/sequence-service")).peekNextDrawingNumberAsync()

      return NextResponse.json({
        imported: imported.length,
        skipped: skipped.length,
        skippedDetails: skipped,
        importedJobs: imported,
        nextDrawingNumber,
      })
    }

    return NextResponse.json({ error: "Unsupported content type" }, { status: 400 })
  } catch (err) {
    return apiInternalError("jobs.api.import", err)
  }
}
