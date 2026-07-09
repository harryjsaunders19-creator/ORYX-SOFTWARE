import type { ModuleDef } from "@/shared/auth/permissions"

/** Primary destinations shown in the mobile bottom bar (max 4 + More). */
export const MOBILE_PRIMARY_NAV_KEYS = ["dashboard", "jobs", "clients", "calendar"] as const

export function isNavItemActive(path: string, key: string, href: string): boolean {
  if (key === "dashboard") return path === "/"
  const prefixMatch = key === "hold-list" || key === "billing" || key === "clients" || key === "jobs" || key === "employees" || key === "password-vault" || key === "job-map"
  return prefixMatch ? path.startsWith(href) : path === href
}

export function splitNavForMobile(all: ModuleDef[]): {
  primary: ModuleDef[]
  overflow: ModuleDef[]
} {
  const primary = MOBILE_PRIMARY_NAV_KEYS
    .map(key => all.find(m => m.key === key))
    .filter((m): m is ModuleDef => !!m)
  const primarySet = new Set(primary.map(m => m.key))
  const overflow = all.filter(m => !primarySet.has(m.key))
  return { primary, overflow }
}

export function isMoreNavActive(path: string, overflow: ModuleDef[]): boolean {
  return overflow.some(m => isNavItemActive(path, m.key, m.href))
}
