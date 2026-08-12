/**
 * GET /api/backups/export-data
 *
 * Live logical backup of Users, Clients, Jobs, and Quotes — works on
 * Supabase/Vercel (unlike filesystem SQLite dumps).
 */
import { NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"
import { requireFullAccess } from "@/shared/auth/auth"
import {
  buildLogicalBackupPack,
  logicalBackupFilename,
} from "../services/logical-export"

export const maxDuration = 60

export async function GET() {
  const auth = await requireFullAccess()
  if (auth instanceof NextResponse) return auth

  const { checkRateLimit, rateLimitedResponse, RATE_PRESETS } = await import(
    "@/shared/auth/rate-limit"
  )
  if (!(await checkRateLimit(`export:${auth.user.id}`, RATE_PRESETS.export))) {
    return rateLimitedResponse(3600)
  }

  try {
    const pack = await buildLogicalBackupPack()
    const body = JSON.stringify(pack, null, 2)
    const filename = logicalBackupFilename(new Date(pack.exportedAt))

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(Buffer.byteLength(body, "utf8")),
        "X-Oryx-Backup-Counts": JSON.stringify(pack.counts),
        "Cache-Control": "private, no-store, must-revalidate",
      },
    })
  } catch (err) {
    return apiInternalError("backups.api.export_data", err)
  }
}
