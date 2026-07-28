import { createAdminClient } from "@/shared/supabase/admin"
import type {
  LeaveCalendarLinkRow,
  LeaveRequestRow,
  LeaveRequestWithMeta,
} from "../types/leave-types"
import type { LeaveRequestStatus } from "../constants"
import {
  toLeaveCalendarLinkRow,
  toLeaveRequestRow,
  toLeaveRequestWithMeta,
  toSupabaseLeaveCalendarLinkRow,
  toSupabaseLeaveRequestRow,
} from "./mapper"

function requests() {
  return createAdminClient().from("leave_requests")
}

function links() {
  return createAdminClient().from("leave_calendar_links")
}

function users() {
  return createAdminClient().from("app_users")
}

function profiles() {
  return createAdminClient().from("employee_profiles")
}

async function enrichMany(rows: LeaveRequestRow[]): Promise<LeaveRequestWithMeta[]> {
  if (!rows.length) return []
  const userIds = [...new Set(rows.map(r => r.userId))]
  const requestIds = rows.map(r => r.id)

  const [{ data: userRows }, { data: profileRows }, { data: linkRows }] = await Promise.all([
    users().select("id, name").in("id", userIds),
    profiles().select("user_id, department, manager_id").in("user_id", userIds),
    links().select("*").in("leave_request_id", requestIds),
  ])

  const userNameById = new Map((userRows ?? []).map(u => [u.id as string, u.name as string]))
  const profileByUser = new Map(
    (profileRows ?? []).map(p => [p.user_id as string, p as { department: string | null; manager_id: string | null }]),
  )
  const linkByRequest = new Map(
    (linkRows ?? []).map(l => [l.leave_request_id as string, l.calendar_event_id as string]),
  )

  const managerIds = [...new Set(
    (profileRows ?? []).map(p => p.manager_id as string | null).filter(Boolean),
  )] as string[]
  const managerNameById = new Map<string, string>()
  if (managerIds.length) {
    const { data: managers } = await users().select("id, name").in("id", managerIds)
    for (const m of managers ?? []) managerNameById.set(m.id as string, m.name as string)
  }

  return rows.map(row => {
    const profile = profileByUser.get(row.userId)
    const managerId = profile?.manager_id ?? null
    return toLeaveRequestWithMeta(row, {
      userName: userNameById.get(row.userId) ?? "",
      department: profile?.department ?? null,
      managerId,
      managerName: managerId ? managerNameById.get(managerId) ?? null : null,
      calendarEventId: linkByRequest.get(row.id) ?? null,
    })
  })
}

export const supabaseLeaveRepo = {
  async upsertRequest(row: LeaveRequestRow): Promise<void> {
    const { error } = await requests().upsert(toSupabaseLeaveRequestRow(row), { onConflict: "id" })
    if (error) throw error
  },

  async upsertLink(row: LeaveCalendarLinkRow): Promise<void> {
    const { error } = await links().upsert(toSupabaseLeaveCalendarLinkRow(row), { onConflict: "leave_request_id" })
    if (error) throw error
  },

  async deleteLink(leaveRequestId: string): Promise<void> {
    const { error } = await links().delete().eq("leave_request_id", leaveRequestId)
    if (error) throw error
  },

  async findUnique(id: string): Promise<LeaveRequestRow | null> {
    const { data, error } = await requests().select("*").eq("id", id).maybeSingle()
    if (error) throw error
    return data ? toLeaveRequestRow(data) : null
  },

  async findMany(opts: {
    userId?: string
    status?: LeaveRequestStatus
    from?: string
    to?: string
    skip?: number
    take?: number
  }): Promise<LeaveRequestWithMeta[]> {
    let q = requests().select("*").order("start_date", { ascending: false })
    if (opts.userId) q = q.eq("user_id", opts.userId)
    if (opts.status) q = q.eq("status", opts.status)
    if (opts.from && opts.to) {
      q = q.lte("start_date", opts.to.slice(0, 10)).gte("end_date", opts.from.slice(0, 10))
    }
    const take = opts.take ?? 200
    const from = opts.skip ?? 0
    q = q.range(from, from + take - 1)

    const { data, error } = await q
    if (error) throw error
    return enrichMany((data ?? []).map(toLeaveRequestRow))
  },

  async getLinkByLeaveId(leaveRequestId: string): Promise<LeaveCalendarLinkRow | null> {
    const { data, error } = await links().select("*").eq("leave_request_id", leaveRequestId).maybeSingle()
    if (error) throw error
    return data ? toLeaveCalendarLinkRow(data) : null
  },

  async getMetaForEvents(eventIds: string[]): Promise<Map<string, {
    leaveRequestId: string
    leaveType: string
    reason: string | null
    status: LeaveRequestStatus
    userId: string
    department: string | null
    managerName: string | null
    reviewedByName: string | null
  }>> {
    const map = new Map<string, {
      leaveRequestId: string
      leaveType: string
      reason: string | null
      status: LeaveRequestStatus
      userId: string
      department: string | null
      managerName: string | null
      reviewedByName: string | null
    }>()
    if (!eventIds.length) return map

    const { data: linkRows, error: linkErr } = await links().select("*").in("calendar_event_id", eventIds)
    if (linkErr) throw linkErr
    if (!linkRows?.length) return map

    const requestIds = linkRows.map(l => l.leave_request_id as string)
    const { data: requestRows, error: reqErr } = await requests().select("*").in("id", requestIds)
    if (reqErr) throw reqErr

    const requestById = new Map((requestRows ?? []).map(r => [r.id as string, toLeaveRequestRow(r)]))
    const userIds = [...new Set((requestRows ?? []).map(r => r.user_id as string))]
    const { data: profileRows } = await profiles().select("user_id, department, manager_id").in("user_id", userIds)
    const profileByUser = new Map(
      (profileRows ?? []).map(p => [p.user_id as string, p as { department: string | null; manager_id: string | null }]),
    )
    const managerIds = [...new Set(
      (profileRows ?? []).map(p => p.manager_id as string | null).filter(Boolean),
    )] as string[]
    const managerNameById = new Map<string, string>()
    if (managerIds.length) {
      const { data: managers } = await users().select("id, name").in("id", managerIds)
      for (const m of managers ?? []) managerNameById.set(m.id as string, m.name as string)
    }

    for (const link of linkRows) {
      const req = requestById.get(link.leave_request_id as string)
      if (!req) continue
      const profile = profileByUser.get(req.userId)
      const managerId = profile?.manager_id ?? null
      map.set(link.calendar_event_id as string, {
        leaveRequestId: req.id,
        leaveType: req.leaveType,
        reason: req.reason,
        status: req.status,
        userId: req.userId,
        department: profile?.department ?? null,
        managerName: managerId ? managerNameById.get(managerId) ?? null : null,
        reviewedByName: req.reviewedByName,
      })
    }
    return map
  },
}
