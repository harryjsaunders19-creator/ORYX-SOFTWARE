/**
 * Canonical Supabase migration module registry — used by /api/supabase/status
 * and the System Health Supabase panel.
 */
import type { supabaseModuleFlags } from "./feature-flags"

export type ModuleFlagKey = keyof ReturnType<typeof supabaseModuleFlags>

export type SupabaseModuleSpec = {
  id: string
  label: string
  flagKey: ModuleFlagKey
  envVar: string
  migration: string
  syncScript: string
  verifyScript?: string
  tables: string[]
  /** Run after these module ids (FK order). */
  dependsOn?: string[]
}

export const SUPABASE_MIGRATION_MODULES: SupabaseModuleSpec[] = [
  {
    id: "users",
    label: "Users",
    flagKey: "users",
    envVar: "SUPABASE_USERS",
    migration: "008_users.sql",
    syncScript: "npm run supabase:sync-users",
    verifyScript: "npm run supabase:verify-users",
    tables: ["app_users"],
  },
  {
    id: "clients",
    label: "Clients",
    flagKey: "clients",
    envVar: "SUPABASE_CLIENTS",
    migration: "001_clients.sql (+ 021_client_contacts.sql)",
    syncScript: "npm run supabase:sync-clients",
    verifyScript: "npm run supabase:verify-clients",
    tables: ["clients", "client_contacts"],
  },
  {
    id: "jobs",
    label: "Jobs",
    flagKey: "jobs",
    envVar: "SUPABASE_JOBS",
    migration: "002_jobs.sql (+ 005_job_commercial_extras.sql)",
    syncScript: "npm run supabase:sync-jobs",
    verifyScript: "npm run supabase:verify-jobs",
    tables: ["jobs"],
    dependsOn: ["clients"],
  },
  {
    id: "statusHistory",
    label: "Status history",
    flagKey: "statusHistory",
    envVar: "SUPABASE_STATUS_HISTORY",
    migration: "004_status_history.sql",
    syncScript: "npm run supabase:sync-status-history",
    verifyScript: "npm run supabase:verify-status-history",
    tables: ["status_history"],
    dependsOn: ["jobs"],
  },
  {
    id: "quotes",
    label: "Quotes",
    flagKey: "quotes",
    envVar: "SUPABASE_QUOTES",
    migration: "003_quotes.sql (+ 004_quote_type_of_works.sql)",
    syncScript: "npm run supabase:sync-quotes",
    verifyScript: "npm run supabase:verify-quotes",
    tables: ["quotes", "quote_line_items"],
    dependsOn: ["clients", "jobs"],
  },
  {
    id: "holds",
    label: "Client holds",
    flagKey: "holds",
    envVar: "SUPABASE_HOLDS",
    migration: "005_client_holds.sql (+ 013_client_holds_updated_at.sql)",
    syncScript: "npm run supabase:sync-holds",
    verifyScript: "npm run supabase:verify-holds",
    tables: ["client_holds"],
    dependsOn: ["clients"],
  },
  {
    id: "billing",
    label: "Billing",
    flagKey: "billing",
    envVar: "SUPABASE_BILLING",
    migration: "006_billing.sql",
    syncScript: "npm run supabase:sync-billing",
    verifyScript: "npm run supabase:verify-billing",
    tables: ["billing_handoffs", "billing_export_batches", "billing_export_snapshots"],
    dependsOn: ["jobs"],
  },
  {
    id: "calendar",
    label: "Calendar",
    flagKey: "calendar",
    envVar: "SUPABASE_CALENDAR",
    migration: "007_calendar.sql (+ 016_calendar_annual_leave.sql)",
    syncScript: "npm run supabase:sync-calendar",
    verifyScript: "npm run supabase:verify-calendar",
    tables: ["event_categories", "calendar_events", "calendar_assignments"],
    dependsOn: ["users", "jobs", "clients"],
  },
  {
    id: "identityLog",
    label: "Identity switch log",
    flagKey: "identityLog",
    envVar: "SUPABASE_IDENTITY_LOG",
    migration: "009_identity_switch_logs.sql",
    syncScript: "npm run supabase:sync-identity-log",
    verifyScript: "npm run supabase:verify-identity-log",
    tables: ["identity_switch_logs"],
    dependsOn: ["users"],
  },
  {
    id: "backups",
    label: "Backup metadata",
    flagKey: "backups",
    envVar: "SUPABASE_BACKUPS",
    migration: "010_backups.sql",
    syncScript: "npm run supabase:sync-backups",
    verifyScript: "npm run supabase:verify-backups",
    tables: ["backup_jobs", "backup_audit_logs"],
  },
  {
    id: "employees",
    label: "Employees",
    flagKey: "employees",
    envVar: "SUPABASE_EMPLOYEES",
    migration: "014_employees.sql",
    syncScript: "npm run supabase:sync-employees",
    verifyScript: "npm run supabase:verify-hr",
    tables: ["employee_profiles", "employee_skills", "employee_documents", "employee_notes", "employee_activity"],
    dependsOn: ["users"],
  },
  {
    id: "leave",
    label: "Leave",
    flagKey: "leave",
    envVar: "SUPABASE_LEAVE",
    migration: "015_leave.sql",
    syncScript: "npm run supabase:sync-leave",
    verifyScript: "npm run supabase:verify-hr",
    tables: ["leave_requests", "leave_calendar_links"],
    dependsOn: ["users", "calendar"],
  },
  {
    id: "passwordVault",
    label: "Account Passwords",
    flagKey: "passwordVault",
    envVar: "SUPABASE_PASSWORD_VAULT",
    migration: "017_password_vault.sql",
    syncScript: "npm run supabase:sync-password-vault",
    verifyScript: "npm run supabase:verify-password-vault",
    tables: ["password_vault_entries"],
  },
  {
    id: "site-visit-calculations",
    label: "Site visit calculations",
    flagKey: "siteVisitCalculations",
    envVar: "SUPABASE_SITE_VISIT_CALCULATIONS",
    migration: "025_site_visit_calculations.sql",
    syncScript: "(no sync — created in app)",
    verifyScript: "npm run supabase:verify-site-visit-calculations",
    tables: ["site_visit_calculations"],
    dependsOn: ["users"],
  },
]

/** Infrastructure migrations applied after core tables. */
export const SUPABASE_INFRA_MIGRATIONS = [
  { id: "soft-delete", label: "Soft delete / archive", migration: "011_soft_delete.sql (+ 022_fix_archive_log_rls.sql)", tables: ["archive_log"] },
  { id: "indexes", label: "Performance indexes", migration: "012_indexes.sql", tables: [] },
  { id: "job-map", label: "Job map / geocoding", migration: "018_job_geocoding.sql (+ 019_job_map_indexes.sql + 020_job_location.sql)", tables: ["jobs"] },
  { id: "job-list-sort", label: "Job list sort key", migration: "023_job_list_sort_key.sql", tables: ["jobs"] },
  { id: "app-sequences", label: "App sequences (drawing/ref counters)", migration: "024_app_sequences.sql", tables: ["app_sequences"] },
] as const

export const SUPABASE_GO_LIVE_STEPS = [
  "Create a Supabase project and copy URL, anon key, and service role key into Vercel env vars (see README production checklist).",
  "In Supabase SQL Editor: run supabase/00-drop-all.sql then supabase/01-bootstrap.sql. Regenerate after migration edits: npm run supabase:bootstrap",
  "Bootstrap seeds admin@test.com / engineer@test.com (dev passwords) with must-change-password on first login. Sync real users via npm run supabase:sync-users for production.",
  "From a machine with your SQLite data: npm run supabase:sync-all",
  "Set ORS_API_KEY on Vercel for site visit routing. Run npm run supabase:verify-site-visit-calculations.",
  "Visit System Health → Supabase and confirm all modules show tables ready.",
  "Deploy — modules read from Supabase automatically when SUPABASE_SERVICE_ROLE_KEY is set (opt out per module with SUPABASE_<MODULE>=false).",
] as const
