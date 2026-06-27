-- =============================================================================
-- Oryx Design — Supabase migration 007: calendar
-- Enable with SUPABASE_CALENDAR=true after sync script
-- =============================================================================

create table if not exists public.event_categories (
  id    text primary key,
  name  text not null,
  color text not null,
  icon  text,
  constraint event_categories_name_unique unique (name)
);

insert into public.event_categories (id, name, color, icon) values
  ('cat_site_visit',       'Site Visit',       '#3B82F6', 'map-pin'),
  ('cat_teams_meeting',    'Teams Meeting',    '#A855F7', 'video'),
  ('cat_survey',           'Survey',           '#F97316', 'clipboard'),
  ('cat_installation',     'Installation',     '#22C55E', 'wrench'),
  ('cat_client_meeting',   'Client Meeting',   '#A855F7', 'users'),
  ('cat_deadline',         'Deadline',         '#EF4444', 'alert-circle'),
  ('cat_leave',            'Leave',            '#6B7280', 'calendar-off'),
  ('cat_internal_meeting', 'Internal Meeting', '#14B8A6', 'message-square')
on conflict (id) do nothing;

create table if not exists public.calendar_events (
  id          text primary key,
  title       text not null,
  description text,
  category_id text not null references public.event_categories (id),
  start_date  timestamptz not null,
  end_date    timestamptz not null,
  all_day     boolean not null default true,
  location    text,
  priority    text not null default 'MEDIUM',
  status      text not null default 'SCHEDULED',
  job_id      text references public.jobs (id) on delete set null,
  client_id   text references public.clients (id) on delete set null,
  created_by  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_calendar_events_start on public.calendar_events (start_date);
create index if not exists idx_calendar_events_end on public.calendar_events (end_date);
create index if not exists idx_calendar_events_category on public.calendar_events (category_id);
create index if not exists idx_calendar_events_job on public.calendar_events (job_id);
create index if not exists idx_calendar_events_client on public.calendar_events (client_id);

drop trigger if exists calendar_events_updated_at on public.calendar_events;
create trigger calendar_events_updated_at
  before update on public.calendar_events
  for each row execute function public.set_updated_at();

alter table public.calendar_events enable row level security;

create policy "Service role full access on calendar_events"
  on public.calendar_events for all to service_role
  using (true) with check (true);

alter table public.event_categories enable row level security;

create policy "Service role full access on event_categories"
  on public.event_categories for all to service_role
  using (true) with check (true);

create table if not exists public.calendar_assignments (
  id       text primary key,
  event_id text not null references public.calendar_events (id) on delete cascade,
  user_id  text not null,
  constraint calendar_assignments_event_user_unique unique (event_id, user_id)
);

create index if not exists idx_calendar_assignments_event on public.calendar_assignments (event_id);
create index if not exists idx_calendar_assignments_user on public.calendar_assignments (user_id);

alter table public.calendar_assignments enable row level security;

create policy "Service role full access on calendar_assignments"
  on public.calendar_assignments for all to service_role
  using (true) with check (true);

notify pgrst, 'reload schema';
