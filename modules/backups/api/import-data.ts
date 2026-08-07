/**
 * POST /api/backups/import-data
 *
 * Restore Users, Clients, Jobs, and Quotes from a logical backup JSON pack.
 */
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { apiInternalError } from "@/shared/api-errors"
import { requireFullAccess } from "@/shared/auth/auth"
import { importLogicalBackupPack } from "../services/logical-import"
import { backupRecordService } from "../services/backup-record-service"
import { logicalBackupPackSchema } from "../services/logical-backup-schema"

export const maxDuration = 60

const jsonFileSchema = z.custom<File>(
  (value) => {
    if (!value || typeof value !== "object") return false
    const v = value as Record<string, unknown>
    return typeof v.name === "string" && typeof v.text === "function"
  },
  "No file provided",
).refine(
  file => file.name.toLowerCase().endsWith(".json"),
  "File must be an ORYX logical backup (.json)",
)

export async function POST(req: NextRequest) {
  const auth = await requireFullAccess()
  if (auth instanceof NextResponse) return auth

  const { checkRateLimit, rateLimitedResponse, RATE_PRESETS } = await import(
    "@/shared/auth/rate-limit"
  )
  if (!(await checkRateLimit(`import:${auth.user.id}`, RATE_PRESETS.import))) {
    return rateLimitedResponse(3600)
  }

  try {
    const formData = await req.formData()
    const fileParsed = jsonFileSchema.safeParse(formData.get("file"))
    if (!fileParsed.success) {
      return NextResponse.json({ error: fileParsed.error.issues[0]?.message ?? "Invalid upload" }, { status: 400 })
    }
    const file = fileParsed.data

    const text = await file.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return NextResponse.json({ error: "Invalid JSON file" }, { status: 400 })
    }

    const payloadParsed = logicalBackupPackSchema.safeParse(parsed)
    if (!payloadParsed.success) {
      return NextResponse.json(
        { error: "Invalid backup file. Expected an ORYX logical backup JSON (Export full data)." },
        { status: 422 },
      )
    }

    const result = await importLogicalBackupPack(payloadParsed.data)

    await backupRecordService
      .logAudit({
        action: "LOGICAL_IMPORT",
        backupId: null,
        userId: auth.user.id,
        userName: auth.user.name,
        detail: `users ${result.users.created}+${result.users.updated}; clients ${result.clients.created}+${result.clients.updated}; jobs ${result.jobs.created}+${result.jobs.updated}; quotes ${result.quotes.created}+${result.quotes.updated}`,
      })
      .catch(() => {})

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed"
    if (/Invalid backup|newer than the app|checksum/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 422 })
    }
    return apiInternalError("backups.api.import_data", err)
  }
}
