-- 045: Aggregate job stats per client for Hold List + client directory meta.
-- Avoids PostgREST default ~1000-row truncation on unbounded .select().in(...).
--
-- Semantics match the previous TypeScript aggregation:
--   active_job_count  = count of jobs where status <> 'ISSUED' (no archived_at filter)
--   quote_value_total = sum of quote_value where quote_value is not null and > 0
-- Includes originals and revisions; groups only the requested client_ids.

create or replace function public.job_stats_for_clients(p_client_ids text[])
returns table (
  client_id text,
  active_job_count integer,
  quote_value_total double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    j.client_id,
    count(*) filter (where j.status is distinct from 'ISSUED')::integer as active_job_count,
    coalesce(
      sum(j.quote_value) filter (
        where j.quote_value is not null and j.quote_value > 0
      ),
      0
    )::float8 as quote_value_total
  from public.jobs j
  where j.client_id = any (p_client_ids)
    and j.client_id is not null
  group by j.client_id;
$$;

revoke all on function public.job_stats_for_clients(text[]) from public, anon, authenticated;
grant execute on function public.job_stats_for_clients(text[]) to service_role;
