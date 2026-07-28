import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireModuleAccess, actorName } from "@/shared/auth/auth"
import { isWorkItemsModelEnabled } from "@/shared/supabase/feature-flags"
import { apiInternalError } from "@/shared/api-errors"
import { VALID_STATUSES } from "@/lib/constants"
import { applyOptionalMoneyField } from "@/shared/utils/api-money"
import { resolveRequiredByDate } from "@/shared/utils/utils"
import { workItemService, parentJobService } from "@/modules/jobs/services/parent-work-item-service"
import type { UpdateWorkItemInput } from "@/modules/jobs/types/parent-dashboard-types"
import { resolveDirectoryDesigner } from "../services/designer-directory"

function modelDisabled() {
  return NextResponse.json(
    { error: "Work items model is not enabled. Set WORK_ITEMS_MODEL=true." },
    { status: 503 },
  )
}

const patchWorkItemBodySchema = z.object({
  status: z.string().optional(),
  designer: z.string().optional(),
  description: z.union([z.string(), z.null()]).optional(),
  notes: z.union([z.string(), z.null()]).optional(),
  commercialNotes: z.union([z.string(), z.null()]).optional(),
  billable: z.union([z.boolean(), z.string(), z.number()]).optional(),
  priority: z.union([z.string(), z.null()]).optional(),
  quoteReference: z.union([z.string(), z.null()]).optional(),
  quoteDate: z.union([z.string(), z.null()]).optional(),
  requestedDate: z.union([z.string(), z.null()]).optional(),
  requiredByDate: z.union([z.string(), z.null()]).optional(),
  quoteValue: z.union([z.string(), z.number(), z.null()]).optional(),
  variationFees: z.union([z.string(), z.number(), z.null()]).optional(),
  additionalCharges: z.union([z.string(), z.number(), z.null()]).optional(),
}).passthrough()

/** GET — single work item (+ parent id for navigation). */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireModuleAccess("jobs")
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
  const auth = await requireModuleAccess("jobs")
  if (auth instanceof NextResponse) return auth
  if (!isWorkItemsModelEnabled()) return modelDisabled()

  try {
    const { id } = await ctx.params
    const bodyRaw = await req.json()
    const parsedBody = patchWorkItemBodySchema.safeParse(bodyRaw)
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request body", field: parsedBody.error.issues[0]?.path?.[0] }, { status: 422 })
    }
    const body = parsedBody.data as Record<string, unknown>
    const patch: UpdateWorkItemInput = { changedBy: actorName(auth.user) }

    if (body.status !== undefined) {
      if (typeof body.status !== "string" || !VALID_STATUSES.includes(body.status as never)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 })
      }
      patch.status = body.status as UpdateWorkItemInput["status"]
    }
    if (typeof body.designer === "string") {
      const resolved = await resolveDirectoryDesigner(body.designer)
      if (!resolved.ok) {
        return NextResponse.json({ error: resolved.error, field: "designer" }, { status: 422 })
      }
      patch.designer = resolved.designer
    }
    if (body.description !== undefined) patch.description = body.description == null ? null : String(body.description)
    if (body.notes !== undefined) patch.notes = body.notes == null ? null : String(body.notes)
    if (body.commercialNotes !== undefined) patch.commercialNotes = body.commercialNotes == null ? null : String(body.commercialNotes)
    if (body.billable !== undefined) patch.billable = Boolean(body.billable)
    if (body.priority !== undefined) patch.priority = body.priority == null ? null : String(body.priority)
    if (body.quoteReference !== undefined) patch.quoteReference = body.quoteReference == null ? null : String(body.quoteReference)
    if (body.quoteDate !== undefined) patch.quoteDate = body.quoteDate == null ? null : String(body.quoteDate)
    if (body.requestedDate !== undefined) patch.requestedDate = body.requestedDate == null ? null : String(body.requestedDate)
    if (body.requiredByDate !== undefined) {
      patch.requiredByDate = resolveRequiredByDate(
        typeof body.requiredByDate === "string" ? body.requiredByDate : null,
      ) ?? null
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
