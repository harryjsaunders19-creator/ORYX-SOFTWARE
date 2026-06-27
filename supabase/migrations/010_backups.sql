-- =============================================================================
-- Oryx Design — Supabase migration 010: backup jobs + audit log
-- Enable with SUPABASE_BACKUPS=true after sync script
-- =============================================================================

create table if not exists public.backup_jobs (
  id                text primary key,
  status            text not null default 'PENDING',
  trigger           text not null default 'MANUAL',
  triggered_by      text not null,
  triggered_by_name text not null,
  folder_name       text not null,
  started_at        timestamptz not null,
  completed_at      timestamptz,
  duration_ms       integer,
  size_bytes        bigint,
  checksum          text,
  row_counts_json   text,
  error_message     text,
  retry_of_id       text references public.backup_jobs (id),
  file_deleted_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint backup_jobs_folder_name_unique unique (folder_name)
);

create index if not exists idx_backup_jobs_status on public.backup_jobs (status);
create index if not exists idx_backup_jobs_created on public.backup_jobs (created_at desc);

drop trigger if exists backup_jobs_updated_at on public.backup_jobs;
create trigger backup_jobs_updated_at
  before update on public.backup_jobs
  for each row execute function public.set_updated_at();

alter table public.backup_jobs enable row level security;

create policy "Service role full access on backup_jobs"
  on public.backup_jobs for all to service_role
  using (true) with check (true);

create table if not exists public.backup_audit_logs (
  id         text primary key,
  action     text not null,
  backup_id  text,
  user_id    text not null,
  user_name  text not null,
  detail     text,
  created_at timestamptz not null default now()
);

create index if not exists idx_backup_audit_logs_backup on public.backup_audit_logs (backup_id);
create index if not exists idx_backup_audit_logs_action on public.backup_audit_logs (action);
create index if not exists idx_backup_audit_logs_created on public.backup_audit_logs (created_at desc);

alter table public.backup_audit_logs enable row level security;

create policy "Service role full access on backup_audit_logs"
  on public.backup_audit_logs for all to service_role
  using (true) with check (true);

notify pgrst, 'reload schema';
