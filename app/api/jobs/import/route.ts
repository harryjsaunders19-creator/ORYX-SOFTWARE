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
import { requireRole } from "@/lib/auth"
import { jobService } from "@/lib/services/job-service"
import { clientService } from "@/lib/services/client-service"
import { sequenceDb } from "@/lib/db"
import { formatDrawingNumber, getYearMonthKey } from "@/lib/drawing-number"
import { createId } from "@paralleldrive/cuid2"
import { isValidWorksType, OTHER_WORKS_TYPE, VALID_STATUSES } from "@/lib/constants"
import {
  parseSpreadsheet,
  markInternalDuplicates,
  dedupKey,
  type ParsedImportRow,
} from "@/lib/import-jobs"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const MAX_ROWS = 5000

const REF_PREFIXES: Record<string, string> = {
  SITE_VISIT: "SV",
  SURVEY:     "SRV",
  INSPECTION: "INS",
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireRole(["ADMIN"])
    if (auth instanceof NextResponse) return auth
    const user = auth.user

    const contentType = req.headers.get("content-type") ?? ""

    // ── Mode 1: File upload → parse & preview ──────────────────────
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData()
      const file = formData.get("file")
      if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 })
      }

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
      let body: { rows?: ParsedImportRow[]; mode?: string }
      try { body = await req.json() }
      catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

      if (body.mode !== "commit" || !Array.isArray(body.rows)) {
        return NextResponse.json({ error: "Expected { mode: 'commit', rows: [...] }" }, { status: 400 })
      }

      const rows = body.rows
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
          const { year, month, key } = getYearMonthKey()
          const seq = sequenceDb.nextSequence(key)
          drawingNumber = formatDrawingNumber(year, month, seq)
        } else if (itemType === "REVISION") {
          skipped.push({ rowIndex: row.rowIndex, reasons: ["Revisions cannot be imported — use the revision creation flow"] })
          continue
        } else {
          const prefix = REF_PREFIXES[itemType]
          if (!prefix) {
            skipped.push({ rowIndex: row.rowIndex, reasons: [`Unknown item type: "${itemType}"`] })
            continue
          }
          drawingNumber = sequenceDb.nextRefNumber(prefix)
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
            requiredByDate: row.requiredByDate || null,
            parentJobId: null,
            revisionLetter: null,
            changedBy,
          })
          imported.push({ drawingNumber, address: row.address, clientCompany: resolvedClientCompany })
        } catch (err) {
          console.error(`[import] Failed to create job for row ${row.rowIndex}:`, err)
          skipped.push({ rowIndex: row.rowIndex, reasons: ["Database error"] })
        }
      }

      // Reconcile sequence counters after import — a safety net that
      // ensures the DrawingSequence/RefSequence counters are at least as
      // high as the highest drawing number now in the database, so the
      // next manually created job continues the sequence correctly even
      // if something unexpected happened during the bulk insert.
      if (imported.length > 0) {
        sequenceDb.syncFromExistingJobs()
      }

      const { year, month, key } = getYearMonthKey()
      const currentSeq = sequenceDb.currentSequence(key)
      const nextDrawingNumber = formatDrawingNumber(year, month, currentSeq + 1)

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
    console.error("[POST /api/jobs/import]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
