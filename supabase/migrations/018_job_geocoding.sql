-- =============================================================================
-- Oryx Design — Supabase migration 018: job map geocoding columns
-- =============================================================================

alter table public.jobs add column if not exists latitude double precision;
alter table public.jobs add column if not exists longitude double precision;
alter table public.jobs add column if not exists geocoded_at timestamptz;
alter table public.jobs add column if not exists geocoded_address text;

create index if not exists idx_jobs_geocode on public.jobs (latitude, longitude)
  where latitude is not null;

notify pgrst, 'reload schema';
