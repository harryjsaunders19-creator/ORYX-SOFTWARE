-- =============================================================================
-- Oryx Design — Supabase migration 015: leave requests + calendar links
-- Enable with SUPABASE_LEAVE=true after sync script
-- =============================================================================

create table if not exists public.leave_requests (
  id               text primary key,
  user_id          text not null references public.app_users (id) on delete cascade,
  leave_type       text not null default 'ANNUAL_LEAVE',
  start_date       text not null,
  end_date         text not null,
  reason           text,
  status           text not null default 'PENDING',
  reviewed_by      text references public.app_users (id) on delete set null,
  reviewed_by_name text,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_leave_requests_user on public.leave_requests (user_id);
create index if not exists idx_leave_requests_status on public.leave_requests (status);
create index if not exists idx_leave_requests_dates on public.leave_requests (start_date, end_date);

drop trigger if exists leave_requests_updated_at on public.leave_requests;
create trigger leave_requests_updated_at
  before update on public.leave_requests
  for each row execute function public.set_updated_at();

alter table public.leave_requests enable row level security;
drop policy if exists "Service role full access on leave_requests" on public.leave_requests;
create policy "Service role full access on leave_requests"
  on public.leave_requests for all to service_role using (true) with check (true);

create table if not exists public.leave_calendar_links (
  leave_request_id  text primary key references public.leave_requests (id) on delete cascade,
  calendar_event_id text not null unique references public.calendar_events (id) on delete cascade,
  user_id           text not null references public.app_users (id) on delete cascade,
  status            text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_leave_calendar_links_event on public.leave_calendar_links (calendar_event_id);

drop trigger if exists leave_calendar_links_updated_at on public.leave_calendar_links;
create trigger leave_calendar_links_updated_at
  before update on public.leave_calendar_links
  for each row execute function public.set_updated_at();

alter table public.leave_calendar_links enable row level security;
drop policy if exists "Service role full access on leave_calendar_links" on public.leave_calendar_links;
create policy "Service role full access on leave_calendar_links"
  on public.leave_calendar_links for all to service_role using (true) with check (true);

notify pgrst, 'reload schema';
