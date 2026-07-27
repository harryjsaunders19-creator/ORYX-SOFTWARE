/**
 * POST /api/backups/import-data
 *
 * Restore Users, Clients, Jobs, and Quotes from a logical backup JSON pack.
 */
import { NextRequest, NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"
import { requireRole } from "@/shared/auth/auth"
import { importLogicalBackupPack } from "../services/logical-import"
import { backupRecordService } from "../services/backup-record-service"

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  const { checkRateLimit, rateLimitedResponse, RATE_PRESETS } = await import(
    "@/shared/auth/rate-limit"
  )
  if (!(await checkRateLimit(`import:${auth.user.id}`, RATE_PRESETS.import))) {
    return rateLimitedResponse(3600)
  }

  try {
    const formData = await req.formData()
    const file = formData.get("file")

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const name = (file as File).name ?? ""
    if (!name.toLowerCase().endsWith(".json")) {
      return NextResponse.json(
        { error: "File must be an Oryx logical backup (.json)" },
        { status: 400 },
      )
    }

    const text = await (file as File).text()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return NextResponse.json({ error: "Invalid JSON file" }, { status: 400 })
    }

    const result = await importLogicalBackupPack(parsed)

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
    if (/Invalid backup|newer than the app/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 422 })
    }
    return apiInternalError("backups.api.import_data", err)
  }
}
