/**
 * lib/permissions.ts
 *
 * Single source of truth for the two-role permissions model (Admin / Engineer).
 *
 * Two kinds of rule live here:
 *  1. Module-level access — which sidebar links / pages a role can see at all
 *     (MODULES below). This drives both the sidebar filtering and the
 *     client-side <RequireRole> page guard.
 *  2. Commercial restriction — Ready For Invoicing and User Management are
 *     full route/page blocks via requireRole(["ADMIN"]) (lib/auth.ts), not a
 *     field redaction. Separately, a handful of Admin-only aggregate
 *     figures (total quoted value, total issued value, average job value)
 *     appear directly on the otherwise fully-shared Dashboard — Jobs and
 *     Quotes themselves are NOT commercially restricted (Engineers see and
 *     set real money figures there, since pricing a quote and converting
 *     it to a job is core Engineer work), but these specific rolled-up
 *     totals are. canViewCommercialValues() below exists for exactly that:
 *     redacting those few fields within /api/stats's otherwise-shared
 *     response, and similarly for the invoiced-value total on the client
 *     detail page.
 */

import { isExperimentalEnabled } from "@/shared/experimental/experimental-features"
import type { Role } from "@/shared/types/role"
export { ROLES, DEFAULT_ROLE, isValidRole, type Role } from "@/shared/types/role"

// ── Module registry ───────────────────────────────────────────────
// `key` is referenced from the sidebar and from each gated page.
// `roles` lists who may see/enter the module. Keep this list in sync with
// the sidebar (components/side-nav.tsx pulls NAV items from here) and with
// PROJECT_OVERVIEW.md §14 whenever a module is added or its access changes.
export interface ModuleDef {
  key:   string
  label: string
  href:  string
  roles: Role[]
}

export const MODULES: ModuleDef[] = [
  { key: "dashboard",  label: "Dashboard", href: "/",                  roles: ["ADMIN", "ENGINEER"] },
  { key: "clients",    label: "Clients",   href: "/clients",           roles: ["ADMIN", "ENGINEER"] },
  { key: "hold-list",  label: "Client Hold List", href: "/clients/hold-list", roles: ["ADMIN", "ENGINEER"] },
  { key: "jobs",       label: "Jobs",      href: "/jobs",              roles: ["ADMIN", "ENGINEER"] },
  { key: "job-map",    label: "Job Map",   href: "/job-map",           roles: ["ADMIN"] },
  { key: "site-visit-calculator", label: "Site Visit Calculator", href: "/site-visit-calculator", roles: ["ADMIN", "ENGINEER"] },
  { key: "quotes",     label: "Quotes",    href: "/quotes",            roles: ["ADMIN", "ENGINEER"] },
  { key: "calendar",   label: "Calendar",   href: "/calendar",          roles: ["ADMIN", "ENGINEER"] },
  { key: "employees",  label: "Employees",  href: "/employees",         roles: ["ADMIN", "ENGINEER"] },
  { key: "password-vault", label: "Account Passwords", href: "/password-vault", roles: ["ADMIN"] },
  { key: "billing",    label: "Ready For Invoicing", href: "/billing", roles: ["ADMIN"] },
  { key: "performance", label: "Performance", href: "/performance",    roles: ["ADMIN"] },
  { key: "archived",   label: "Archived Items", href: "/archived",      roles: ["ADMIN"] },
  { key: "users",      label: "Users",      href: "/users",            roles: ["ADMIN"] },
  { key: "backups",    label: "System Backup", href: "/backups",       roles: ["ADMIN"] },
  { key: "health",     label: "System Health", href: "/health",        roles: ["ADMIN"] },
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
 */
export function canAccessModule(role: Role, key: string, moduleAccess?: ModuleKey[] | null): boolean {
  const m = getModule(key)
  if (!m) return true
  if (!m.roles.includes(role)) return false
  if (role === "ADMIN") return true
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
  if (role === "ADMIN" || moduleAccess == null) return base
  return base.filter(m => moduleAccess.includes(m.key))
}

// ── Capability checks ────────────────────────────────────────────────
// Each function answers one question about what a role can do. Used by
// both API routes (server-side enforcement) and UI components (hide/show).

/** Financial aggregates on the dashboard and client pages (totals, averages, invoiced values). */
export function canViewCommercialValues(role: Role): boolean {
  return role === "ADMIN"
}

/** Job counts, completion rates, and performance analytics per client. */
export function canViewClientAnalytics(role: Role): boolean {
  return role === "ADMIN"
}

/** Hard-delete a job (as opposed to status changes, which any role can do). */
export function canDeleteJobs(role: Role): boolean {
  return role === "ADMIN"
}

/** Bulk import jobs from spreadsheet. */
export function canImportJobs(role: Role): boolean {
  return role === "ADMIN"
}

/** Export job data to CSV/Excel. */
export function canExportJobs(role: Role): boolean {
  return role === "ADMIN"
}

export function canDeleteCalendarEvents(role: Role): boolean {
  return role === "ADMIN"
}
