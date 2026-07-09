-- =============================================================================
-- Oryx Design — Supabase migration 020: job location management fields
-- =============================================================================

alter table public.jobs add column if not exists site_name text;
alter table public.jobs add column if not exists site_address text;
alter table public.jobs add column if not exists location_status text;
alter table public.jobs add column if not exists location_source text;

-- Backfill site_address from legacy address column
update public.jobs
set site_address = address
where (site_address is null or trim(site_address) = '')
  and address is not null
  and trim(address) != '';

-- Existing coordinates → mapped / geocoded (do not change lat/lng)
update public.jobs
set location_status = 'mapped',
    location_source = 'geocoded'
where latitude is not null
  and longitude is not null
  and location_status is null;

create index if not exists idx_jobs_location_status on public.jobs (location_status)
  where status = 'ISSUED' and archived_at is null;

notify pgrst, 'reload schema';
