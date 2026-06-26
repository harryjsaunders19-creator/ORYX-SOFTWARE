import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { backupJobDb, backupAuditDb } from "@/lib/db"
import { startBackup, BACKUPS_DIR } from "@/lib/backup-service"

export async function GET() {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const backups = backupJobDb.findMany({ take: 50 })
    const auditLog = backupAuditDb.findMany({ take: 20 })
    return NextResponse.json({ backups, auditLog, backupsDir: BACKUPS_DIR })
  } catch (err) {
    console.error("[GET /api/backups]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const recent = backupJobDb.findMany({ take: 5 })
    if (recent.some(b => b.status === "PENDING" || b.status === "RUNNING")) {
      return NextResponse.json({ error: "A backup is already in progress" }, { status: 409 })
    }

    const job = startBackup({
      triggeredBy: auth.user.id,
      triggeredByName: auth.user.name,
      trigger: "MANUAL",
    })

    return NextResponse.json({ job }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/backups]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
