export const ROLES = ["ADMIN", "ENGINEER"] as const
export type Role = (typeof ROLES)[number]
export const DEFAULT_ROLE: Role = "ENGINEER"
export function isValidRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v)
}
