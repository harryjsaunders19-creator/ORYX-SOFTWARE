-- Oryx Design — migration 042: Job location mode (one-off vs managed site)
-- Additive only. Existing jobs stay ONE_OFF unless already linked to a site.
-- location_name mirrors site_name; postcode supports search/dedupe.

alter table public.jobs
  add column if not exists location_mode text not null default 'ONE_OFF';

alter table public.jobs
  add column if not exists location_name text;

alter table public.jobs
  add column if not exists postcode text;

alter table public.parent_jobs
  add column if not exists location_mode text not null default 'ONE_OFF';

alter table public.parent_jobs
  add column if not exists location_name text;

alter table public.parent_jobs
  add column if not exists postcode text;

-- Backfill from existing denormalized fields
update public.jobs
set location_name = coalesce(nullif(trim(location_name), ''), nullif(trim(site_name), ''))
where location_name is null and site_name is not null;

update public.jobs
set location_mode = 'MANAGED_SITE'
where site_id is not null and location_mode = 'ONE_OFF';

update public.parent_jobs
set location_name = coalesce(nullif(trim(location_name), ''), nullif(trim(site_name), ''))
where location_name is null and site_name is not null;

update public.parent_jobs
set location_mode = 'MANAGED_SITE'
where site_id is not null and location_mode = 'ONE_OFF';

create index if not exists idx_jobs_location_mode on public.jobs (location_mode);
create index if not exists idx_jobs_postcode on public.jobs (postcode);
create index if not exists idx_parent_jobs_location_mode on public.parent_jobs (location_mode);
create index if not exists idx_parent_jobs_postcode on public.parent_jobs (postcode);

comment on column public.jobs.location_mode is
  'ONE_OFF = job stores its own address (site_id null). MANAGED_SITE = linked via site_id.';
comment on column public.jobs.location_name is
  'Display name for the property or managed site. Mirrors site_name for compatibility.';
comment on column public.jobs.postcode is
  'Postcode for search and duplicate detection. Optional.';

notify pgrst, 'reload schema';
