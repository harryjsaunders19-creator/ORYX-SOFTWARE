/**
 * Concatenates supabase/migrations/*.sql into supabase/01-bootstrap.sql
 * in FK-safe order. Run after changing any migration file:
 *   node scripts/build-supabase-bootstrap.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const migrationsDir = path.join(root, "supabase", "migrations")
const outFile = path.join(root, "supabase", "01-bootstrap.sql")

const SET_UPDATED_AT = `-- Shared trigger for updated_at columns
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

`

/** FK-safe apply order (not numeric filename order). */
const MIGRATION_ORDER = [
  "001_clients.sql",
  "002_jobs.sql",
  "005_job_commercial_extras.sql",
  "003_quotes.sql",
  "004_quote_type_of_works.sql",
  "004_status_history.sql",
  "005_client_holds.sql",
  "013_client_holds_updated_at.sql",
  "006_billing.sql",
  "007_calendar.sql",
  "008_users.sql",
  "009_identity_switch_logs.sql",
  "010_backups.sql",
  "011_soft_delete.sql",
  "022_fix_archive_log_rls.sql",
  "012_indexes.sql",
  "014_employees.sql",
  "015_leave.sql",
  "016_calendar_annual_leave.sql",
  "017_password_vault.sql",
  "018_job_geocoding.sql",
  "019_job_map_indexes.sql",
  "020_job_location.sql",
  "021_client_contacts.sql",
  "023_job_list_sort_key.sql",
  "024_app_sequences.sql",
  "025_site_visit_calculations.sql",
  "026_login_rate_limits.sql",
  "027_security_sequences_aggregates.sql",
  "028_employee_files_storage.sql",
  "029_job_billable.sql",
  "030_parent_jobs_work_items.sql",
  "031_work_item_fk_nullable.sql",
  "032_audit_rpc_rate_limit_billing_export.sql",
  "033_convert_quote_to_job.sql",
  "034_session_revocations.sql",
  "035_perf_hot_path_indexes.sql",
  "036_job_tags.sql",
  "037_job_documents.sql",
  "038_user_module_access.sql",
  "039_job_design_standards.sql",
  "040_dashboard_active_jobs_statuses.sql",
  "041_dashboard_active_jobs_new_in_progress.sql",
  "042_dashboard_active_revisions.sql",
]

const header = `-- =============================================================================
-- ORYX Supabase — Step 1: Full bootstrap (auto-generated)
-- =============================================================================
-- DO NOT EDIT BY HAND — regenerate with:
--   node scripts/build-supabase-bootstrap.mjs
--
-- Prerequisites: run supabase/00-drop-all.sql first (clean slate), OR run on a
-- fresh project (idempotent: IF NOT EXISTS throughout).
--
-- After this:
--   1. Set Vercel env vars (see README production checklist)
--   2. Log in with seeded accounts — passwords must be changed on first login
--   3. npm run supabase:sync-all  (from a machine with SQLite data)
--   4. System Health → Supabase — confirm all modules green
-- =============================================================================

`

const parts = [header, SET_UPDATED_AT]

for (const name of MIGRATION_ORDER) {
  const file = path.join(migrationsDir, name)
  if (!fs.existsSync(file)) {
    console.error("Missing migration:", name)
    process.exit(1)
  }
  parts.push(`-- ─── ${name} ───\n`)
  parts.push(fs.readFileSync(file, "utf8").trim())
  parts.push("\n\n")
}

parts.push("notify pgrst, 'reload schema';\n\n")

const seedAdmin = path.join(root, "supabase", "seed-admin.sql")
if (fs.existsSync(seedAdmin)) {
  parts.push(`-- ─── seed-admin.sql (default logins) ───\n`)
  parts.push(fs.readFileSync(seedAdmin, "utf8").trim())
  parts.push("\n\nnotify pgrst, 'reload schema';\n")
}

fs.writeFileSync(outFile, parts.join(""))
console.log("Wrote", path.relative(root, outFile), `(${MIGRATION_ORDER.length} migrations + seed-admin)`)
