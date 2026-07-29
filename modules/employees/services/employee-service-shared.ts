/**
 * Employee service — shared types and pure helpers used by both the SQLite
 * and Supabase backend implementations.
 */
import type { UserRow } from "@/modules/users/types"
import type {
  EmployeeProfileRow,
  EmployeeSkillRow,
  EmployeeDocumentRow,
  EmployeeNoteRow,
  EmployeeActivityRow,
  EmploymentStatus,
} from "@/modules/employees/types/employee-types"
import { canViewSalary, type EmployeeAccess } from "@/modules/employees/permissions"
import type { Role } from "@/shared/types/role"

export interface EmployeeListItem {
  userId: string
  name: string
  email: string | null
  role: Role
  active: boolean
  employeeId: string | null
  profilePhotoPath: string | null
  jobTitle: string | null
  department: string | null
  phone: string | null
  employmentStatus: EmploymentStatus
  startDate: string | null
  profileCompletion: number
}

export interface EmployeeDetail extends EmployeeListItem {
  profile: Omit<EmployeeProfileRow, "salary"> & { salary?: number | null }
  managerName: string | null
  skills: EmployeeSkillRow[]
  documents: EmployeeDocumentRow[]
  notes?: EmployeeNoteRow[]
  activity: EmployeeActivityRow[]
  leave: {
    annualLeaveAllowance: number
    leaveTaken: number
    remaining: number
    upcoming: { id: string; title: string; startDate: string; endDate: string; status?: string }[]
    history: { id: string; title: string; startDate: string; endDate: string; status?: string }[]
  }
  yearsOfService: number | null
  profileCompletion: number
}

export const PROFILE_FIELDS: (keyof EmployeeProfileRow)[] = [
  "firstName", "lastName", "phone", "mobile", "jobTitle", "department",
  "startDate", "address", "emergencyContactName", "profilePhotoPath",
]

export function computeProfileCompletion(profile: EmployeeProfileRow, user: UserRow): number {
  let filled = 0
  const total = PROFILE_FIELDS.length + 1
  if (user.email) filled++
  for (const f of PROFILE_FIELDS) {
    const v = profile[f]
    if (v != null && String(v).trim() !== "") filled++
  }
  return Math.round((filled / total) * 100)
}

export function buildListItem(profile: EmployeeProfileRow, user: UserRow): EmployeeListItem {
  const displayName = profile.preferredName?.trim()
    || [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim()
    || user.name
  return {
    userId: user.id,
    name: displayName,
    email: user.email,
    role: user.role as Role,
    active: !!user.active,
    employeeId: profile.employeeId,
    profilePhotoPath: profile.profilePhotoPath,
    jobTitle: profile.jobTitle,
    department: profile.department,
    phone: profile.phone ?? profile.mobile,
    employmentStatus: profile.employmentStatus,
    startDate: profile.startDate,
    profileCompletion: computeProfileCompletion(profile, user),
  }
}

export function yearsOfService(startDate: string | null): number | null {
  if (!startDate) return null
  const start = new Date(startDate)
  if (Number.isNaN(start.getTime())) return null
  return Math.floor((Date.now() - start.getTime()) / (365.25 * 24 * 3600 * 1000))
}

export function redactProfile(profile: EmployeeProfileRow, access: EmployeeAccess): EmployeeProfileRow {
  if (canViewSalary(access)) return profile
  return { ...profile, salary: null }
}
