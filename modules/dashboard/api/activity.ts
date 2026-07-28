import { NextRequest, NextResponse } from "next/server"
import { requireModuleAccess } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { parseLimitParam } from "@/shared/utils/pagination"
import { listResponse } from "@/shared/utils/api-cache"
import { historyService } from "@/modules/jobs"
import type { ActivityItem } from "../types/activity-types"

function statusLabel(status: string | null | undefined): string {
  if (!status) return ""
  return status
    .toLowerCase()
    .split("_")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireModuleAccess("dashboard")
    if (auth instanceof NextResponse) return auth

    const limit = parseLimitParam(req.nextUrl.searchParams.get("limit"), 20, 50)
    const rows = await historyService.recentForExport(limit)

    const items: ActivityItem[] = rows.map(row => ({
      id: row.id,
      jobId: row.jobId,
      drawingNumber: row.drawingNumber,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      fromLabel: statusLabel(row.fromStatus),
      toLabel: statusLabel(row.toStatus),
      changedBy: row.changedBy,
      changedAt: row.changedAt,
      note: row.note,
      href: row.jobId ? `/jobs/${row.jobId}` : null,
    }))

    return listResponse({ items })
  } catch (err) {
    return apiInternalError("dashboard.activity.get", err)
  }
}
