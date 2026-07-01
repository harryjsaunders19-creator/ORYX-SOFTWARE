/**
 * Shared Supabase infrastructure — admin client, config, feature flags.
 * Module repos live under modules/{name}/supabase/.
 */
export {
  getSupabaseUrl,
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  isSupabaseConfigured,
  isSupabaseAdminConfigured,
} from "./config"

export { createAdminClient } from "./admin"
export { aggSum, aggAvg, aggCount } from "./aggregates"
export {
  useSupabaseClients,
  useSupabaseJobs,
  useSupabaseQuotes,
  useSupabaseStatusHistory,
  useSupabaseHolds,
  useSupabaseBilling,
  useSupabaseCalendar,
  useSupabaseUsers,
  useSupabaseIdentityLog,
  useSupabaseBackups,
  useSupabaseEmployees,
  useSupabaseLeave,
  supabaseModuleFlags,
} from "./feature-flags"
export {
  isMissingColumnError,
  jobsArchivedFilterEnabled,
  quotesArchivedFilterEnabled,
  jobsArchivedAtAvailable,
  quotesArchivedAtAvailable,
  disableJobsArchivedFilter,
  disableQuotesArchivedFilter,
  noteJobsArchivedFromError,
  noteQuotesArchivedFromError,
  probeArchivedColumns,
} from "./archived-filter"
export { ensureSequencesSeeded, ensureBatchSequenceSeeded } from "./seed-sequences"
export { resetSupabaseOperationalData } from "./reset-all-data"
export {
  SUPABASE_MIGRATION_MODULES,
  SUPABASE_INFRA_MIGRATIONS,
  SUPABASE_GO_LIVE_STEPS,
} from "./migration-catalog"
export { buildSupabaseStatusReport } from "./status-report"
export type { SupabaseStatusReport, ModuleStatusReport } from "./status-report"
