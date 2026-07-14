import { NextRequest, NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { requireRole } from "@/shared/auth/auth"
import { isSupabaseOnly } from "@/lib/supabase/feature-flags"
import { backupRecordService } from "../services/backup-record-service"
import { startBackup, BACKUPS_DIR, LOCAL_BACKUPS_EPHEMERAL_ON_VERCEL } from "../backup-service"

export async function GET() {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const [backups, auditLog] = await Promise.all([
      backupRecordService.findMany({ take: 50 }),
      backupRecordService.findAuditMany({ take: 20 }),
    ])
    return NextResponse.json({
      backups,
      auditLog,
      backupsDir: BACKUPS_DIR,
      localBackupSupported: !isSupabaseOnly(),
      localBackupDurable: !isSupabaseOnly() && !LOCAL_BACKUPS_EPHEMERAL_ON_VERCEL,
    })
  } catch (err) {
    return apiInternalError("backups.api.list", err)
  }
}

export async function POST(_req: NextRequest) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    if (isSupabaseOnly()) {
      return NextResponse.json(
        {
          error:
            "Local SQLite backups are not available when Supabase is the data store. Use Supabase project backups or Export Excel from this page.",
          reason: "supabase_primary",
        },
        { status: 503 },
      )
    }
    if (LOCAL_BACKUPS_EPHEMERAL_ON_VERCEL) {
      return NextResponse.json(
        {
          error:
            "Local backups on Vercel without BACKUPS_DIR use ephemeral /tmp storage and would be lost. Set BACKUPS_DIR to persistent storage, or use Supabase backups / Excel export.",
          reason: "ephemeral_tmp",
        },
        { status: 503 },
      )
    }

    const recent = await backupRecordService.findMany({ take: 5 })
    if (recent.some(b => b.status === "PENDING" || b.status === "RUNNING")) {
      return NextResponse.json({ error: "A backup is already in progress" }, { status: 409 })
    }

    const job = await startBackup({
      triggeredBy: auth.user.id,
      triggeredByName: auth.user.name,
      trigger: "MANUAL",
    })

    return NextResponse.json({ job }, { status: 201 })
  } catch (err) {
    return apiInternalError("backups.api.list", err)
  }
}
