import type { CalendarEventWithDetails } from "@/modules/calendar/types"
import { leaveDb } from "@/lib/db/stores"
import { ANNUAL_LEAVE_CATEGORY_ID } from "./constants"
import { useSupabaseLeave } from "@/shared/supabase/feature-flags"
import { supabaseLeaveRepo } from "./supabase/repository"

export async function enrichEventsWithLeave(
  events: CalendarEventWithDetails[],
): Promise<CalendarEventWithDetails[]> {
  const leaveIds = events.filter(e => e.categoryId === ANNUAL_LEAVE_CATEGORY_ID).map(e => e.id)
  if (!leaveIds.length) return events

  const metaMap = useSupabaseLeave()
    ? await supabaseLeaveRepo.getMetaForEvents(leaveIds)
    : leaveDb.getMetaForEvents(leaveIds)

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
