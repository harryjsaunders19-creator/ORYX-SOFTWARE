import { NextRequest, NextResponse } from "next/server"
import { requireRole, actorName } from "@/shared/auth/auth"
import { useWorkItemsModel } from "@/lib/supabase/feature-flags"
import { apiInternalError } from "@/shared/api-errors"
import { applyOptionalMoneyField } from "@/shared/utils/api-money"
import { resolveRequiredByDate } from "@/shared/utils/utils"
import { parentJobService } from "@/modules/jobs/services/parent-work-item-service"

function modelDisabled() {
  return NextResponse.json(
    { error: "Work items model is not enabled. Set WORK_ITEMS_MODEL=true." },
    { status: 503 },
  )
}

/** POST — create Revision work item on a parent job. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(["ADMIN", "ENGINEER"])
  if (auth instanceof NextResponse) return auth
  if (!useWorkItemsModel()) return modelDisabled()

  try {
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))

    const money: { quoteValue?: number | null } = {}
    const moneyErr = applyOptionalMoneyField(body, "quoteValue", money)
    if (moneyErr) return moneyErr

    const descriptionRaw =
      typeof body.description === "string" ? body.description
      : typeof body.notes === "string" ? body.notes
      : ""
    const description = descriptionRaw.trim()
    if (description.length < 3) {
      return NextResponse.json(
        { error: "Reason for revision is required", field: "description" },
        { status: 422 },
      )
    }

    const item = await parentJobService.createRevision(id, {
      description,
      billable: body.billable === true || body.billable === "true",
      designer: typeof body.designer === "string" ? body.designer : "",
      priority: typeof body.priority === "string" ? body.priority : null,
      quoteValue: money.quoteValue ?? null,
      requiredByDate: resolveRequiredByDate(body.requiredByDate) ?? null,
      notes: description,
      changedBy: actorName(auth.user),
    })

    return NextResponse.json(item, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create revision"
    if (/Reason for revision/i.test(msg)) {
      return NextResponse.json({ error: msg, field: "description" }, { status: 422 })
    }
    if (/not found|Cannot add/i.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    return apiInternalError("parent-jobs.work-items.create", err)
  }
}
