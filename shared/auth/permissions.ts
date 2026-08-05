/**
 * Centralised ORYX OS permission model.
 *
 * Roles:
 *   ADMIN    — full system access; designer-eligible
 *   ENGINEER — engineering workflow; designer-eligible; no user/system admin
 *   ACCOUNTS — same system access as Admin; never designer-eligible
 *
 * Prefer these helpers over scattered `role === "ADMIN"` checks.
 */

import { isExperimentalEnabled } from "@/shared/experimental/experimental-features"
import {
  hasFullAccess,
  isAdminRole,
  isAccountsRole,
  isDesignerEligibleRole,
  isValidRole,
  roleDisplayLabel,
  type Role,
} from "@/shared/types/role"

export {
  ROLES,
  DEFAULT_ROLE,
  FULL_ACCESS_ROLES,
  DESIGNER_ELIGIBLE_ROLES,
  isValidRole,
  hasFullAccess,
  isAdminRole,
  isAccountsRole,
  isDesignerEligibleRole,
  roleDisplayLabel,
  coerceRole,
  type Role,
  type FullAccessRole,
} from "@/shared/types/role"

// ── Module registry ───────────────────────────────────────────────
export interface ModuleDef {
  key: string
  label: string
  href: string
  roles: Role[]
}

/** Roles that may see engineering / shared workflow modules. */
const WORKFLOW_ROLES: Role[] = ["ADMIN", "ENGINEER", "ACCOUNTS"]
/** Roles with full administrative module access. */
const ADMIN_ROLES: Role[] = ["ADMIN", "ACCOUNTS"]

export const MODULES: ModuleDef[] = [
  { key: "dashboard",  label: "Dashboard", href: "/",                  roles: WORKFLOW_ROLES },
  { key: "clients",    label: "Clients",   href: "/clients",           roles: WORKFLOW_ROLES },
  { key: "hold-list",  label: "Client Hold List", href: "/clients/hold-list", roles: WORKFLOW_ROLES },
  { key: "jobs",       label: "Jobs",      href: "/jobs",              roles: WORKFLOW_ROLES },
  { key: "job-map",    label: "Job Map",   href: "/job-map",           roles: ADMIN_ROLES },
  { key: "site-visit-calculator", label: "Site Visit Calculator", href: "/site-visit-calculator", roles: WORKFLOW_ROLES },
  { key: "quotes",     label: "Quotes",    href: "/quotes",            roles: WORKFLOW_ROLES },
  { key: "calendar",   label: "Calendar",   href: "/calendar",          roles: WORKFLOW_ROLES },
  { key: "employees",  label: "Employees",  href: "/employees",         roles: WORKFLOW_ROLES },
  { key: "password-vault", label: "Account Passwords", href: "/password-vault", roles: ADMIN_ROLES },
  { key: "billing",    label: "Ready For Invoicing", href: "/billing", roles: ADMIN_ROLES },
  { key: "performance", label: "Performance", href: "/performance",    roles: ADMIN_ROLES },
  { key: "archived",   label: "Archived Items", href: "/archived",      roles: ADMIN_ROLES },
  { key: "users",      label: "Users",      href: "/users",            roles: ADMIN_ROLES },
  { key: "backups",    label: "System Backup", href: "/backups",       roles: ADMIN_ROLES },
  { key: "health",     label: "System Health", href: "/health",        roles: ADMIN_ROLES },
]

export function getModule(key: string): ModuleDef | undefined {
  return MODULES.find(m => m.key === key)
}

export type ModuleKey = typeof MODULES[number]["key"]

export function isValidModuleKey(value: unknown): value is ModuleKey {
  return typeof value === "string" && MODULES.some(m => m.key === value)
}

function engineerAssignableModuleSet(): Set<string> {
  return new Set(MODULES.filter(m => m.roles.includes("ENGINEER")).map(m => m.key))
}

/**
 * Canonicalize admin-managed module access config:
 * - invalid keys are dropped
 * - duplicate keys are removed
 * - admin-only keys are stripped (engineers can never be granted those)
 * - null/undefined means "use role defaults"
 */
export function normalizeModuleAccess(value: unknown): ModuleKey[] | null {
  if (value == null) return null
  if (!Array.isArray(value)) return null
  const allowedForEngineers = engineerAssignableModuleSet()
  const out: ModuleKey[] = []
  for (const item of value) {
    if (!isValidModuleKey(item)) continue
    if (!allowedForEngineers.has(item)) continue
    if (out.includes(item)) continue
    out.push(item)
  }
  return out
}

export function serializeModuleAccess(value: ModuleKey[] | null): string | null {
  if (value == null) return null
  return JSON.stringify(value)
}

export function parseModuleAccessJson(value: string | null | undefined): ModuleKey[] | null {
  if (!value) return null
  try {
    return normalizeModuleAccess(JSON.parse(value))
  } catch {
    return null
  }
}

/**
 * Module visibility for a role + optional per-user allow-list.
 * Unknown keys fail-open here for nav/UI only — API routes must use
 * `requireModuleAccess`, which fails closed on unknown keys.
 *
 * Admin and Accounts always have full access to modules listed for them
 * (per-user allow-list does not apply).
 */
export function canAccessModule(role: Role, key: string, moduleAccess?: ModuleKey[] | null): boolean {
  const m = getModule(key)
  if (!m) return true
  if (!m.roles.includes(role)) return false
  if (hasFullAccess(role)) return true
  if (moduleAccess == null) return true
  return moduleAccess.includes(m.key)
}

export function modulesForRole(role: Role): ModuleDef[] {
  return MODULES.filter(m => {
    if (m.key === "employees" && !isExperimentalEnabled("employees")) return false
    if (m.key === "job-map" && !isExperimentalEnabled("jobMap")) return false
    return m.roles.includes(role)
  })
}

export function modulesForUser(role: Role, moduleAccess?: ModuleKey[] | null): ModuleDef[] {
  const base = modulesForRole(role)
  if (hasFullAccess(role) || moduleAccess == null) return base
  return base.filter(m => moduleAccess.includes(m.key))
}

// ── Capability checks ────────────────────────────────────────────────
// Each function answers one question. Used by API routes and UI.

type RoleLike = Role | string | null | undefined

/** Actor shape accepted by user-aware helpers. */
export interface PermissionUser {
  role: RoleLike
  active?: number | boolean | null
  moduleAccess?: ModuleKey[] | null
  moduleAccessJson?: string | null
}

function roleOf(userOrRole: PermissionUser | RoleLike): RoleLike {
  if (userOrRole == null) return null
  if (typeof userOrRole === "string") return userOrRole
  return userOrRole.role
}

function moduleAccessOf(user: PermissionUser): ModuleKey[] | null {
  if (user.moduleAccess !== undefined) return user.moduleAccess
  return parseModuleAccessJson(user.moduleAccessJson)
}

function isActiveUser(user: PermissionUser): boolean {
  if (user.active == null) return true
  if (typeof user.active === "number") return user.active === 1
  return !!user.active
}

/** Financial aggregates on the dashboard and client pages. */
export function canViewCommercialValues(role: RoleLike): boolean {
  return hasFullAccess(role)
}

/** Job counts, completion rates, and performance analytics per client. */
export function canViewClientAnalytics(role: RoleLike): boolean {
  return hasFullAccess(role)
}

export function canViewPerformance(userOrRole: PermissionUser | RoleLike): boolean {
  const role = roleOf(userOrRole) as Role
  if (!isValidRole(role)) return false
  if (typeof userOrRole === "object" && userOrRole) {
    return canAccessModule(role, "performance", moduleAccessOf(userOrRole))
  }
  return canAccessModule(role, "performance")
}

/** Hard-delete a job (as opposed to status changes). */
export function canDeleteJobs(role: RoleLike): boolean {
  return hasFullAccess(role)
}

/** Bulk import jobs from spreadsheet. */
export function canImportJobs(role: RoleLike): boolean {
  return hasFullAccess(role)
}

/** Export job data to CSV/Excel. */
export function canExportJobs(role: RoleLike): boolean {
  return hasFullAccess(role)
}

export function canDeleteCalendarEvents(role: RoleLike): boolean {
  return hasFullAccess(role)
}

/** Create / edit / delete users and change roles. */
export function canManageUsers(userOrRole: PermissionUser | RoleLike): boolean {
  return hasFullAccess(roleOf(userOrRole))
}

/** Backups, system health, company/admin configuration. */
export function canManageSystem(userOrRole: PermissionUser | RoleLike): boolean {
  return hasFullAccess(roleOf(userOrRole))
}

/** Engineering job create — any role with jobs module access. */
export function canCreateJob(userOrRole: PermissionUser | RoleLike): boolean {
  const role = roleOf(userOrRole) as Role
  if (!isValidRole(role)) return false
  if (typeof userOrRole === "object" && userOrRole) {
    return canAccessModule(role, "jobs", moduleAccessOf(userOrRole))
  }
  return canAccessModule(role, "jobs")
}

export function canEditJob(userOrRole: PermissionUser | RoleLike): boolean {
  return canCreateJob(userOrRole)
}

export function canCreateQuote(userOrRole: PermissionUser | RoleLike): boolean {
  const role = roleOf(userOrRole) as Role
  if (!isValidRole(role)) return false
  if (typeof userOrRole === "object" && userOrRole) {
    return canAccessModule(role, "quotes", moduleAccessOf(userOrRole))
  }
  return canAccessModule(role, "quotes")
}

export function canUseSiteVisitCalculator(userOrRole: PermissionUser | RoleLike): boolean {
  const role = roleOf(userOrRole) as Role
  if (!isValidRole(role)) return false
  if (typeof userOrRole === "object" && userOrRole) {
    return canAccessModule(role, "site-visit-calculator", moduleAccessOf(userOrRole))
  }
  return canAccessModule(role, "site-visit-calculator")
}

/**
 * Whether the user may appear in designer / engineering assignment pickers.
 * Accounts always false. Inactive users always false.
 */
export function isDesignerEligible(user: PermissionUser): boolean {
  if (!isActiveUser(user)) return false
  return isDesignerEligibleRole(roleOf(user))
}

/** Whether the current actor may set/change a designer field (workflow users). */
export function canAssignDesigner(userOrRole: PermissionUser | RoleLike): boolean {
  return canEditJob(userOrRole)
}

/** Roles that skip per-user moduleAccess restrictions (Admin + Accounts). */
export function usesFullModuleAccess(role: RoleLike): boolean {
  return hasFullAccess(role)
}
