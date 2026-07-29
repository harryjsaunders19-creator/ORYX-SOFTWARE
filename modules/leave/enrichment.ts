import type { CalendarEventWithDetails } from "@/modules/calendar/types"
import { ANNUAL_LEAVE_CATEGORY_ID } from "./constants"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"

export async function enrichEventsWithLeave(
  events: CalendarEventWithDetails[],
): Promise<CalendarEventWithDetails[]> {
  const leaveIds = events.filter(e => e.categoryId === ANNUAL_LEAVE_CATEGORY_ID).map(e => e.id)
  if (!leaveIds.length) return events

  let metaMap: Map<string, {
    leaveRequestId: string
    leaveType: string
    reason: string | null
    status: string
    userId: string
    department: string | null
    managerName: string | null
    reviewedByName: string | null
  }>

  if (isSupabaseOnly()) {
    const { supabaseLeaveRepo } = await import("./supabase/repository")
    metaMap = await supabaseLeaveRepo.getMetaForEvents(leaveIds)
  } else {
    const { leaveDb } = await import("@/lib/db/stores")
    metaMap = leaveDb.getMetaForEvents(leaveIds)
  }

  return events.map(event => {
    const meta = metaMap.get(event.id)
    if (!meta) return event
    return {
      ...event,
      leaveRequestId: meta.leaveRequestId,
      leaveType: meta.leaveType,
      leaveReason: meta.reason,
      leaveReviewStatus: meta.status,
      leaveUserId: meta.userId,
      employeeDepartment: meta.department,
      managerName: meta.managerName,
      reviewedByName: meta.reviewedByName,
    }
  })
}
