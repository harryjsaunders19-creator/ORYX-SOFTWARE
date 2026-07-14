-- =============================================================================
-- Oryx Design — migration 031: allow work-item-only history and billing FKs
-- Required for Phase 2 when new DESIGN projects no longer create jobs rows.
-- =============================================================================

alter table public.status_history
  alter column job_id drop not null;

alter table public.billing_handoffs
  alter column source_job_id drop not null;

create unique index if not exists idx_billing_handoffs_active_work_item_unique
  on public.billing_handoffs (source_work_item_id)
  where cleared_by_accounts_at is null and source_work_item_id is not null;

comment on column public.status_history.work_item_id is
  'Preferred FK when WORK_ITEMS_MODEL is on; job_id kept for legacy rows.';

comment on column public.billing_handoffs.source_work_item_id is
  'Preferred FK when WORK_ITEMS_MODEL is on; source_job_id kept for legacy rows.';

notify pgrst, 'reload schema';
