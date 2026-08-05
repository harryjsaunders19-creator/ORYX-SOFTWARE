/**
 * Canonical ORYX OS roles.
 *
 * - ADMIN — full system access; designer-eligible
 * - ENGINEER — engineering workflow; designer-eligible
 * - ACCOUNTS — same system access as Admin; never designer-eligible
 */
export const ROLES = ["ADMIN", "ENGINEER", "ACCOUNTS"] as const
export type Role = (typeof ROLES)[number]
export const DEFAULT_ROLE: Role = "ENGINEER"

/** Roles with full administrative / module access (Admin + Accounts). */
export const FULL_ACCESS_ROLES = ["ADMIN", "ACCOUNTS"] as const
export type FullAccessRole = (typeof FULL_ACCESS_ROLES)[number]

/** Roles that may be assigned as designers / engineering resources. */
export const DESIGNER_ELIGIBLE_ROLES = ["ADMIN", "ENGINEER"] as const

export function isValidRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v)
}

export function hasFullAccess(role: Role | string | null | undefined): boolean {
  return role === "ADMIN" || role === "ACCOUNTS"
}

export function isAdminRole(role: Role | string | null | undefined): boolean {
  return role === "ADMIN"
}

export function isAccountsRole(role: Role | string | null | undefined): boolean {
  return role === "ACCOUNTS"
}

export function isEngineerRole(role: Role | string | null | undefined): boolean {
  return role === "ENGINEER"
}

/**
 * Whether this role may appear in designer / engineering assignment lists.
 * Accounts always returns false — they are administrative, not engineering.
 */
export function isDesignerEligibleRole(role: Role | string | null | undefined): boolean {
  return role === "ADMIN" || role === "ENGINEER"
}

export function roleDisplayLabel(role: Role | string | null | undefined): string {
  switch (role) {
    case "ADMIN":
      return "Admin"
    case "ACCOUNTS":
      return "Accounts"
    case "ENGINEER":
      return "Engineer"
    default:
      return "Unknown"
  }
}

/** Coerce imported / legacy role strings; unknown values become ENGINEER. */
export function coerceRole(value: unknown): Role {
  if (typeof value === "string") {
    const upper = value.trim().toUpperCase()
    if (isValidRole(upper)) return upper
  }
  return DEFAULT_ROLE
}
