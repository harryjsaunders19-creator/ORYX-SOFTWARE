/**
 * Employee profile access control — Admin / Accounts / Engineer roles.
 * Managers are engineers who appear as managerId on direct reports.
 */
import type { Role } from "@/shared/types/role"
import type { UserRow } from "@/modules/users/types"
import { hasFullAccess } from "@/shared/auth/permissions"

export type EmployeeAccess = "admin" | "manager" | "self" | "none"

export function isAdmin(role: Role): boolean {
  return hasFullAccess(role)
}

/** Fields employees may PATCH on their own profile. */
export const EMPLOYEE_SELF_EDIT_FIELDS = new Set([
  "preferredName", "phone", "mobile", "address", "city", "county", "postcode", "country",
  "emergencyContactName", "emergencyContactPhone", "emergencyContactRelationship",
  "profilePhotoPath",
])

/** Fields only admin/manager may edit. */
export const EMPLOYMENT_ADMIN_FIELDS = new Set([
  "employeeId", "firstName", "lastName", "dateOfBirth", "gender", "nationality",
  "jobTitle", "department", "managerId", "officeLocation", "employmentType",
  "employmentStatus", "startDate", "endDate", "probationEndDate", "workingHours", "salary",
  "annualLeaveAllowance", "leaveTaken",
])

export function resolveEmployeeAccess(
  viewer: UserRow,
  targetUserId: string,
  directReportIds: string[],
): EmployeeAccess {
  if (viewer.id === targetUserId) return "self"
  if (isAdmin(viewer.role as Role)) return "admin"
  if (directReportIds.includes(targetUserId)) return "manager"
  return "none"
}

/** Any signed-in user may open an employee profile; field-level redaction applies. */
export function canViewEmployee(
  _viewer: UserRow,
  _targetUserId: string,
  _directReportIds: string[],
): boolean {
  return true
}

export function canEditEmployeeField(
  access: EmployeeAccess,
  field: string,
): boolean {
  if (access === "admin" || access === "manager") return true
  if (access === "self") return EMPLOYEE_SELF_EDIT_FIELDS.has(field)
  return false
}

export function canViewSalary(access: EmployeeAccess): boolean {
  return access === "admin"
}

export function canManageDocuments(access: EmployeeAccess): boolean {
  return access === "admin" || access === "manager"
}

/** View document metadata/files — admin, manager of the employee, or self. */
export function canViewDocuments(access: EmployeeAccess): boolean {
  return access === "admin" || access === "manager" || access === "self"
}

export function canUploadRestrictedDocuments(access: EmployeeAccess): boolean {
  return access === "admin" || access === "manager"
}

export function canViewNotes(access: EmployeeAccess): boolean {
  return access === "admin" || access === "manager"
}

/** Profile photo download — active colleagues only; blocks arbitrary user-id probing. */
export function canViewEmployeePhoto(opts: {
  viewerActive: boolean
  targetHasProfile: boolean
  targetUserActive: boolean
}): boolean {
  return opts.viewerActive && opts.targetHasProfile && opts.targetUserActive
}

export function canEditNotes(access: EmployeeAccess): boolean {
  return access === "admin" || access === "manager"
}

export function filterPatchByAccess(
  access: EmployeeAccess,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (canEditEmployeeField(access, k)) out[k] = v
  }
  return out
}
