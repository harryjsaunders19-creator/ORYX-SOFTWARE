import { NextRequest, NextResponse } from "next/server"
import { requireSignIn, requireRole, actorName } from "@/shared/auth/auth"
import { isWorkItemsModelEnabled } from "@/lib/supabase/feature-flags"
import { apiInternalError } from "@/shared/api-errors"
import { VALID_STATUSES } from "@/lib/constants"
import { applyOptionalMoneyField } from "@/shared/utils/api-money"
import { resolveRequiredByDate } from "@/shared/utils/utils"
import { workItemService, parentJobService } from "@/modules/jobs/services/parent-work-item-service"
import type { UpdateWorkItemInput } from "@/modules/jobs/types/parent-dashboard-types"

function modelDisabled() {
  return NextResponse.json(
    { error: "Work items model is not enabled. Set WORK_ITEMS_MODEL=true." },
    { status: 503 },
  )
}

/** GET — single work item (+ parent id for navigation). */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireSignIn()
  if (auth instanceof NextResponse) return auth
  if (!isWorkItemsModelEnabled()) return modelDisabled()

  try {
    const { id } = await ctx.params
    const item = await workItemService.findUnique(id)
    if (!item) return NextResponse.json({ error: "Work item not found" }, { status: 404 })
    const parent = await parentJobService.findUnique(item.parentJobId)
    return NextResponse.json({ workItem: item, parent })
  } catch (err) {
    return apiInternalError("work-items.by-id", err)
  }
}

/** PATCH — update work item status / designer / commercial fields. */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(["ADMIN", "ENGINEER"])
  if (auth instanceof NextResponse) return auth
  if (!isWorkItemsModelEnabled()) return modelDisabled()

  try {
    const { id } = await ctx.params
    const body = await req.json()
    const patch: UpdateWorkItemInput = { changedBy: actorName(auth.user) }

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 })
      }
      patch.status = body.status
    }
    if (typeof body.designer === "string") patch.designer = body.designer
    if (body.description !== undefined) patch.description = body.description
    if (body.notes !== undefined) patch.notes = body.notes
    if (body.commercialNotes !== undefined) patch.commercialNotes = body.commercialNotes
    if (body.billable !== undefined) patch.billable = Boolean(body.billable)
    if (body.priority !== undefined) patch.priority = body.priority
    if (body.quoteReference !== undefined) patch.quoteReference = body.quoteReference
    if (body.quoteDate !== undefined) patch.quoteDate = body.quoteDate
    if (body.requestedDate !== undefined) patch.requestedDate = body.requestedDate
    if (body.requiredByDate !== undefined) {
      patch.requiredByDate = resolveRequiredByDate(body.requiredByDate) ?? null
    }

    for (const key of ["quoteValue", "variationFees", "additionalCharges"] as const) {
      const bag: Record<string, unknown> = {}
      const err = applyOptionalMoneyField(body, key, bag)
      if (err) return err
      if (bag[key] !== undefined) (patch as Record<string, unknown>)[key] = bag[key]
    }

    const updated = await workItemService.update(id, patch)
    if (!updated) return NextResponse.json({ error: "Work item not found" }, { status: 404 })
    return NextResponse.json(updated)
  } catch (err) {
    return apiInternalError("work-items.patch", err)
  }
}
