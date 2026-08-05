-- =============================================================================
-- Oryx Design — Supabase migration 044: Jobs list parent/scope indexes
-- Additive only — supports Jobs Register parent-only lists, client filters,
-- and revision sidecar lookups. Idempotent: CREATE INDEX IF NOT EXISTS.
-- =============================================================================

-- Default Jobs Register: active parent jobs ordered by list_sort_key
create index if not exists idx_jobs_parents_list_sort_active
  on public.jobs (list_sort_key, created_at)
  where archived_at is null
    and parent_job_id is null;

-- Client filter on parent Jobs Register
create index if not exists idx_jobs_parents_client_list_sort
  on public.jobs (client_id, list_sort_key, created_at)
  where archived_at is null
    and parent_job_id is null
    and client_id is not null;

-- Revision sidecar fetch ordered by letter within a parent
create index if not exists idx_jobs_parent_revision_letter
  on public.jobs (parent_job_id, revision_letter)
  where parent_job_id is not null;

notify pgrst, 'reload schema';
