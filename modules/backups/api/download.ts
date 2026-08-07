/**
 * GET /api/backups/download
 *
 * Streams the latest completed, non-pruned backup data.json to the browser
 * as a file download. Requires ADMIN role.
 *
 * Returns 404 if no completed backup exists or if all backup files have
 * been pruned from disk.
 */
import { NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { requireFullAccess } from "@/shared/auth/auth"
import { backupRecordService } from "../services/backup-record-service"
import { backupDataFilePath } from "../backup-service"
import fs from "fs"
import { format } from "date-fns"

export async function GET() {
  const auth = await requireFullAccess()
  if (auth instanceof NextResponse) return auth

  try {
    // Find the latest completed backup that still has its file on disk.
    const backups = await backupRecordService.findMany({ take: 50 })
    const available = backups.find(
      b => b.status === "COMPLETED" && !b.fileDeletedAt
    )

    if (!available) {
      return NextResponse.json(
        { error: "No backup file available. Run a backup first, then try again." },
        { status: 404 },
      )
    }

    const filePath = backupDataFilePath(available)

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: "Backup file not found on disk. It may have been removed." },
        { status: 404 },
      )
    }

    const fileBuffer = fs.readFileSync(filePath)
    const dateStr    = available.completedAt
      ? format(new Date(available.completedAt), "yyyy-MM-dd_HH-mm")
      : available.folderName
    const filename   = `oryx-backup-${dateStr}.json`

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type":        "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length":      String(fileBuffer.length),
      },
    })
  } catch (err) {
    return apiInternalError("backups.api.download", err)
  }
}
