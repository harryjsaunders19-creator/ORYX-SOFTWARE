-- =============================================================================
-- Oryx Design — Supabase migration 035: hot-path performance indexes
-- Additive only — matches list/billing/notifications/history query patterns.
-- Idempotent: CREATE INDEX IF NOT EXISTS.
-- =============================================================================

-- Default jobs list: archived_at IS NULL ORDER BY list_sort_key, created_at
create index if not exists idx_jobs_list_sort_key_active
  on public.jobs (list_sort_key, created_at)
  where archived_at is null;

-- Deadline / notifications: non-issued active jobs with a due date
create index if not exists idx_jobs_required_by_active_open
  on public.jobs (required_by_date)
  where archived_at is null
    and status <> 'ISSUED'
    and required_by_date is not null;

-- Billing "Awaiting Accounts Action" queue sort
create index if not exists idx_billing_handoffs_queue_at_active
  on public.billing_handoffs (added_to_billing_queue_at)
  where cleared_by_accounts_at is null;

-- Job status timeline (filter by job, order by changed_at)
create index if not exists idx_status_history_job_changed
  on public.status_history (job_id, changed_at);

-- Active hold list ordered by added_at
create index if not exists idx_client_holds_active_added
  on public.client_holds (added_at desc)
  where status = 'ACTIVE';

-- Quotes list: archived_at IS NULL ORDER BY created_at DESC
create index if not exists idx_quotes_created_at_active
  on public.quotes (created_at desc)
  where archived_at is null;

-- Parent jobs work-items UI orders by updated_at
create index if not exists idx_parent_jobs_updated_at
  on public.parent_jobs (updated_at desc);

-- Low-traffic FK covers (advisor: unindexed_foreign_keys)
create index if not exists idx_leave_requests_reviewed_by
  on public.leave_requests (reviewed_by)
  where reviewed_by is not null;

create index if not exists idx_leave_calendar_links_user_id
  on public.leave_calendar_links (user_id);

create index if not exists idx_site_visit_calculations_created_by
  on public.site_visit_calculations (created_by);

notify pgrst, 'reload schema';
