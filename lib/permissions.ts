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

export const ROLES = ["ADMIN", "ENGINEER"] as const
export type Role = (typeof ROLES)[number]

export const DEFAULT_ROLE: Role = "ENGINEER"

export function isValidRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v)
}

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
  { key: "hold-list",  label: "Hold List", href: "/clients/hold-list", roles: ["ADMIN", "ENGINEER"] },
  { key: "jobs",       label: "Jobs",      href: "/jobs",              roles: ["ADMIN", "ENGINEER"] },
  { key: "quotes",     label: "Quotes",    href: "/quotes",            roles: ["ADMIN", "ENGINEER"] },
  { key: "calendar",   label: "Calendar",   href: "/calendar",          roles: ["ADMIN", "ENGINEER"] },
  { key: "billing",    label: "Ready For Invoicing", href: "/billing", roles: ["ADMIN"] },
  { key: "users",      label: "Users",      href: "/users",            roles: ["ADMIN"] },
  { key: "backups",    label: "System Backup", href: "/backups",       roles: ["ADMIN"] },
  { key: "health",     label: "System Health", href: "/health",        roles: ["ADMIN"] },
]

export function getModule(key: string): ModuleDef | undefined {
  return MODULES.find(m => m.key === key)
}

export function canAccessModule(role: Role, key: string): boolean {
  const m = getModule(key)
  return m ? m.roles.includes(role) : true   // unknown modules default open — fail-open on nav, never on the API
}

export function modulesForRole(role: Role): ModuleDef[] {
  return MODULES.filter(m => m.roles.includes(role))
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
