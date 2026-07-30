-- Oryx Design — migration 041: Client → Site → Job hierarchy
-- Sites are reusable physical locations under a Client.
-- Jobs reference sites via site_id; legacy site_name/site_address retained.

create table if not exists public.sites (
  id                   text primary key,
  client_id            text not null references public.clients (id) on delete cascade,
  name                 text not null,
  name_lower           text not null,
  address_line1        text,
  address_line2        text,
  city                 text,
  county               text,
  postcode             text,
  postcode_normalized  text,
  country              text,
  site_reference       text,
  primary_contact_id   text references public.client_contacts (id) on delete set null,
  notes                text,
  is_active            boolean not null default true,
  archived_at          timestamptz,
  archived_by          text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_sites_client on public.sites (client_id);
create index if not exists idx_sites_name on public.sites (client_id, name_lower);
create index if not exists idx_sites_postcode on public.sites (client_id, postcode_normalized);
create index if not exists idx_sites_active on public.sites (is_active) where is_active = true;

create table if not exists public.site_audit_events (
  id                  text primary key,
  site_id             text not null references public.sites (id) on delete cascade,
  action              text not null,
  summary             text not null,
  job_id              text,
  drawing_number      text,
  from_site_id        text,
  performed_by        text not null default 'System',
  performed_by_name   text not null default 'System',
  performed_at        timestamptz not null default now(),
  meta                jsonb
);

create index if not exists idx_site_audit_site
  on public.site_audit_events (site_id, performed_at desc);

alter table public.jobs
  add column if not exists site_id text references public.sites (id) on delete set null;

alter table public.parent_jobs
  add column if not exists site_id text references public.sites (id) on delete set null;

alter table public.quotes
  add column if not exists site_id text references public.sites (id) on delete set null;

create index if not exists idx_jobs_site_id on public.jobs (site_id);
create index if not exists idx_parent_jobs_site_id on public.parent_jobs (site_id);
create index if not exists idx_quotes_site_id on public.quotes (site_id);

drop trigger if exists sites_updated_at on public.sites;
create trigger sites_updated_at
  before update on public.sites
  for each row execute function public.set_updated_at();

alter table public.sites enable row level security;
alter table public.site_audit_events enable row level security;

drop policy if exists "Service role full access on sites" on public.sites;
create policy "Service role full access on sites"
  on public.sites for all to service_role
  using (true) with check (true);

drop policy if exists "Service role full access on site_audit_events" on public.site_audit_events;
create policy "Service role full access on site_audit_events"
  on public.site_audit_events for all to service_role
  using (true) with check (true);

comment on table public.sites is
  'Reusable physical location under a Client. One Site has many independent Jobs.';
comment on column public.jobs.site_id is
  'FK to sites. Legacy site_name/site_address remain as denormalized display snapshots.';
comment on column public.parent_jobs.site_id is
  'FK to sites for work-items parent projects.';

notify pgrst, 'reload schema';
