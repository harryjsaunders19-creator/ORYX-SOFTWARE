/**
 * Job map — entry router. Uses createRequire so the SQLite module is never
 * evaluated when isSupabaseOnly(). See docs/sqlite-sunset.md (Path A).
 */
import { createRequire } from "node:module"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"

const require = createRequire(import.meta.url)

export const jobMapService = isSupabaseOnly()
  ? (require("./job-map-service-supabase") as typeof import("./job-map-service-supabase")).jobMapService
  : (require("./job-map-service-sqlite") as typeof import("./job-map-service-sqlite")).jobMapService

export { MAP_JOB_STATUS, GEOCODE_BATCH_SIZE, MAP_MARKER_LIMIT } from "./job-map-service-shared"
