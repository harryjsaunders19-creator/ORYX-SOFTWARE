/**
 * POST /api/clients/import
 *
 * Two modes:
 *   1. multipart/form-data with "file" → parse & preview (no DB writes)
 *   2. application/json with { rows, mode: "commit" } → bulk insert
 */
import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { clientDb } from "@/lib/db"
import { createId } from "@paralleldrive/cuid2"
import {
  parseClientSpreadsheet,
  markInternalClientDuplicates,
  clientDedupKey,
  type ParsedClientRow,
} from "@/lib/import-clients"

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_ROWS = 5000

export async function POST(req: NextRequest) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const contentType = req.headers.get("content-type") ?? ""

    // ── Phase 1: Parse file → preview ───────────────────────────
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
        return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 422 })
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      const result = parseClientSpreadsheet(buffer, file.name)

      if (result.rows.length === 0) {
        return NextResponse.json({ error: "No data rows found in file" }, { status: 422 })
      }
      if (result.rows.length > MAX_ROWS) {
        return NextResponse.json({ error: `Too many rows (${result.rows.length}). Maximum is ${MAX_ROWS}.` }, { status: 422 })
      }

      markInternalClientDuplicates(result.rows)

      // Check against existing clients
      const existingClients = clientDb.findMany({ take: 10000 })
      const existingNames = new Set(existingClients.map(c => c.nameLower))
      const existingCodes = new Map(
        existingClients.filter(c => c.accountCode).map(c => [c.accountCode!.toLowerCase(), c.name])
      )

      for (const row of result.rows) {
        if (row.errors.length > 0) continue
        if (existingNames.has(clientDedupKey(row.name))) {
          row.warnings.push("A client with this company name already exists")
        }
        if (row.accountCode) {
          const match = existingCodes.get(row.accountCode.toLowerCase())
          if (match) {
            row.warnings.push(`Customer ID already used by "${match}"`)
          }
        }
      }

      const requiredFieldsMissing = !Object.values(result.mapping).includes("name")

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
          total:    result.rows.length,
          valid:    result.rows.filter(r => r.errors.length === 0).length,
          errors:   result.rows.filter(r => r.errors.length > 0).length,
          warnings: result.rows.filter(r => r.warnings.length > 0).length,
        },
      })
    }

    // ── Phase 2: Commit ─────────────────────────────────────────
    if (contentType.includes("application/json")) {
      let body: { rows?: ParsedClientRow[]; mode?: string }
      try { body = await req.json() }
      catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

      if (body.mode !== "commit" || !Array.isArray(body.rows)) {
        return NextResponse.json({ error: "Expected { mode: 'commit', rows: [...] }" }, { status: 400 })
      }

      const rows = body.rows
      if (rows.length > MAX_ROWS) {
        return NextResponse.json({ error: `Too many rows (${rows.length})` }, { status: 422 })
      }

      const imported: { name: string; accountCode: string }[] = []
      const skipped: { rowIndex: number; reasons: string[] }[] = []

      for (const row of rows) {
        const reasons: string[] = []
        if (!row.name?.trim()) reasons.push("Missing company name")

        // Skip if name already exists
        if (row.name && clientDb.findByName(row.name.trim())) {
          reasons.push("Company name already exists")
        }

        if (reasons.length > 0) {
          skipped.push({ rowIndex: row.rowIndex, reasons })
          continue
        }

        try {
          clientDb.create({
            id:             createId(),
            name:           row.name.trim(),
            contactName:    row.contactName?.trim() || null,
            email:          row.email?.trim() || null,
            phone:          row.phone?.trim() || null,
            billingAddress: row.billingAddress?.trim() || null,
            notes:          row.notes?.trim() || null,
            accountCode:    row.accountCode?.trim() || null,
          })
          imported.push({ name: row.name.trim(), accountCode: row.accountCode?.trim() || "" })
        } catch (err) {
          console.error(`[client import] Failed row ${row.rowIndex}:`, err)
          skipped.push({ rowIndex: row.rowIndex, reasons: ["Database error"] })
        }
      }

      return NextResponse.json({
        imported: imported.length,
        skipped: skipped.length,
        skippedDetails: skipped,
        importedClients: imported,
      })
    }

    return NextResponse.json({ error: "Unsupported content type" }, { status: 400 })
  } catch (err) {
    console.error("[POST /api/clients/import]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
