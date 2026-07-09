-- =============================================================================
-- Oryx Design — Supabase migration 019: job map query indexes
-- =============================================================================

-- Individual coordinate indexes (map filter + geocode status queries)
create index if not exists idx_jobs_latitude on public.jobs (latitude)
  where latitude is not null;

create index if not exists idx_jobs_longitude on public.jobs (longitude)
  where longitude is not null;

-- Completed jobs with coordinates (map display query)
create index if not exists idx_jobs_map_plotted on public.jobs (status, archived_at, latitude, longitude)
  where status = 'ISSUED'
    and archived_at is null
    and latitude is not null
    and longitude is not null;

-- Completed jobs missing coordinates (admin geocode + notification count)
create index if not exists idx_jobs_map_missing_coords on public.jobs (status, archived_at)
  where status = 'ISSUED'
    and archived_at is null
    and (latitude is null or longitude is null);

notify pgrst, 'reload schema';
