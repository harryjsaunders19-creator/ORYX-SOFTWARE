-- 027: Lock privileged RPCs + app_sequences; safe sequence seed; SQL aggregates.
-- Fixes live advisor findings: anon-executable SECURITY DEFINER wipe/bump,
-- RLS disabled on app_sequences, mutable search_path on set_updated_at.

-- ── Wipe RPC: never callable via anon/authenticated Data API ───────────────
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'reset_operational_data'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    revoke execute on function public.reset_operational_data() from public, anon, authenticated;
    grant execute on function public.reset_operational_data() to service_role;
  end if;
end $$;

-- ── app_sequences: RLS + revoke table privileges from API roles ─────────────
alter table if exists public.app_sequences enable row level security;

revoke all on table public.app_sequences from public, anon, authenticated;
grant all on table public.app_sequences to service_role;

drop policy if exists "service_role all app_sequences" on public.app_sequences;
create policy "service_role all app_sequences"
  on public.app_sequences
  for all
  to service_role
  using (true)
  with check (true);

-- ── bump_app_sequence: service_role only ────────────────────────────────────
revoke execute on function public.bump_app_sequence(text, int) from public, anon, authenticated;
grant execute on function public.bump_app_sequence(text, int) to service_role;

-- Floor seed that never lowers an existing counter (cold-start safe).
create or replace function public.seed_app_sequence(p_name text, p_value int)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v integer;
begin
  if p_value is null or p_value < 0 then
    raise exception 'seed_app_sequence: p_value must be >= 0';
  end if;
  insert into app_sequences (name, value)
  values (p_name, p_value)
  on conflict (name) do update
    set value = greatest(app_sequences.value, excluded.value)
  returning value into v;
  return v;
end;
$$;

revoke all on function public.seed_app_sequence(text, int) from public, anon, authenticated;
grant execute on function public.seed_app_sequence(text, int) to service_role;

-- ── set_updated_at: pin search_path ─────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_updated_at'
  ) then
    execute 'alter function public.set_updated_at() set search_path = public';
  end if;
end $$;

-- ── Dashboard job aggregates (no 1000-row PostgREST cap) ────────────────────
create or replace function public.job_dashboard_counts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with active as (
    select status, item_type, designer, parent_job_id, required_by_date
    from jobs
    where archived_at is null
  ),
  by_status as (
    select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', c) order by status), '[]'::jsonb) as v
    from (select status, count(*)::int as c from active group by status) s
  ),
  by_type as (
    select coalesce(jsonb_agg(jsonb_build_object('itemType', item_type, 'count', c) order by item_type), '[]'::jsonb) as v
    from (select item_type, count(*)::int as c from active group by item_type) t
  ),
  meta as (
    select
      count(*) filter (where coalesce(designer, '') = '')::int as unassigned,
      count(*) filter (where parent_job_id is null)::int as total_active_jobs,
      count(*) filter (where parent_job_id is not null)::int as total_revisions,
      -- Deadline tallies exclude ISSUED; dueThisWeek is today..today+7 inclusive.
      count(*) filter (
        where status <> 'ISSUED'
          and required_by_date is not null
          and required_by_date::date < (timezone('utc', now()))::date
      )::int as overdue_count,
      count(*) filter (
        where status <> 'ISSUED'
          and required_by_date is not null
          and required_by_date::date = (timezone('utc', now()))::date
      )::int as due_today_count,
      count(*) filter (
        where status <> 'ISSUED'
          and required_by_date is not null
          and required_by_date::date >= (timezone('utc', now()))::date
          and required_by_date::date <= ((timezone('utc', now()))::date + 7)
      )::int as due_this_week_count
    from active
  )
  select jsonb_build_object(
    'byStatus', (select v from by_status),
    'byItemType', (select v from by_type),
    'unassigned', (select unassigned from meta),
    'totalActiveJobs', (select total_active_jobs from meta),
    'totalRevisions', (select total_revisions from meta),
    'overdueCount', (select overdue_count from meta),
    'dueTodayCount', (select due_today_count from meta),
    'dueThisWeekCount', (select due_this_week_count from meta)
  );
$$;

revoke all on function public.job_dashboard_counts() from public, anon, authenticated;
grant execute on function public.job_dashboard_counts() to service_role;

-- ── Quote stats aggregates ──────────────────────────────────────────────────
create or replace function public.quote_stats_agg()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with active as (
    select status, coalesce(quote_value, 0)::numeric as quote_value
    from quotes
    where archived_at is null
  ),
  tallies as (
    select
      count(*)::int as total,
      count(*) filter (where status = 'DRAFT')::int as draft,
      count(*) filter (where status = 'SENT')::int as sent,
      count(*) filter (where status = 'ACCEPTED')::int as accepted,
      count(*) filter (where status = 'REJECTED')::int as rejected,
      count(*) filter (where status = 'EXPIRED')::int as expired,
      coalesce(sum(quote_value), 0)::float8 as total_value,
      coalesce(sum(quote_value) filter (where status = 'ACCEPTED'), 0)::float8 as accepted_value
    from active
  )
  select jsonb_build_object(
    'total', total,
    'draft', draft,
    'sent', sent,
    'accepted', accepted,
    'rejected', rejected,
    'expired', expired,
    'totalValue', total_value,
    'acceptedValue', accepted_value,
    'conversionRate', case
      when (accepted + rejected) > 0 then accepted::float8 / (accepted + rejected)::float8
      else 0::float8
    end
  )
  from tallies;
$$;

revoke all on function public.quote_stats_agg() from public, anon, authenticated;
grant execute on function public.quote_stats_agg() to service_role;
