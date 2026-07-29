/**
 * Employee service entry — routes to Supabase-only or SQLite (local/CI).
 * Uses createRequire so the SQLite module is never evaluated when isSupabaseOnly().
 * Dual-write hybrid was removed; see docs/sqlite-sunset.md.
 */
import { createRequire } from "node:module"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"

const require = createRequire(import.meta.url)

export const employeeService = isSupabaseOnly()
  ? (require("./employee-service-supabase") as typeof import("./employee-service-supabase")).employeeService
  : (require("./employee-service-sqlite") as typeof import("./employee-service-sqlite")).employeeService

export { computeProfileCompletion } from "./employee-service-shared"
export type { EmployeeListItem, EmployeeDetail } from "./employee-service-shared"
