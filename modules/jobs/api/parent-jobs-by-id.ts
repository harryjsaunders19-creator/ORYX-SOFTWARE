import { NextRequest, NextResponse } from "next/server"
import { requireSignIn } from "@/shared/auth/auth"
import { useWorkItemsModel } from "@/lib/supabase/feature-flags"
import { apiInternalError } from "@/shared/api-errors"
import { parentJobService } from "@/modules/jobs/services/parent-work-item-service"

function modelDisabled() {
  return NextResponse.json(
    { error: "Work items model is not enabled. Set WORK_ITEMS_MODEL=true." },
    { status: 503 },
  )
}

/** GET — parent job dashboard (project shell + work item timeline). */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireSignIn()
  if (auth instanceof NextResponse) return auth
  if (!useWorkItemsModel()) return modelDisabled()

  try {
    const { id } = await ctx.params
    const dashboard = await parentJobService.getDashboard(id)
    if (!dashboard) {
      return NextResponse.json({ error: "Parent job not found" }, { status: 404 })
    }
    return NextResponse.json(dashboard)
  } catch (err) {
    return apiInternalError("parent-jobs.by-id", err)
  }
}
