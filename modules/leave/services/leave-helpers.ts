import { leaveTypeLabel } from "../constants"

export const SHOW_PENDING_ON_CREATE = true

export function toAllDayRange(startDate: string, endDate: string) {
  const start = startDate.slice(0, 10)
  const end = endDate.slice(0, 10)
  return {
    startDate: `${start}T00:00:00.000Z`,
    endDate: `${end}T23:59:59.999Z`,
  }
}

export function buildEventTitle(userName: string, leaveType: string): string {
  return `${userName} — ${leaveTypeLabel(leaveType)}`
}
