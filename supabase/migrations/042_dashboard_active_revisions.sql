-- 042: Dashboard revision KPI — only revisions still in flight.
-- Excludes Ready to Send (sent) and Complete (ISSUED).

create or replace function public.job_dashboard_counts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with active as (
    select id, status, item_type, designer, parent_job_id, revision_letter, required_by_date
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
  originals as (
    select id, status from active where parent_job_id is null
  ),
  latest_rev as (
    select distinct on (parent_job_id)
      parent_job_id,
      status
    from active
    where parent_job_id is not null
    order by parent_job_id, revision_letter desc nulls last
  ),
  effective_original as (
    select o.id, coalesce(lr.status, o.status) as status
    from originals o
    left join latest_rev lr on lr.parent_job_id = o.id
  ),
  meta as (
    select
      count(*) filter (where coalesce(designer, '') = '')::int as unassigned,
      (
        select count(*)::int
        from effective_original
        where status in ('NEW_REQUEST', 'IN_DESIGN')
      ) as total_active_jobs,
      count(*) filter (
        where parent_job_id is not null
          and status in ('NEW_REQUEST', 'IN_DESIGN', 'CHECKING')
      )::int as active_revisions,
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
    'activeRevisions', (select active_revisions from meta),
    'overdueCount', (select overdue_count from meta),
    'dueTodayCount', (select due_today_count from meta),
    'dueThisWeekCount', (select due_this_week_count from meta)
  );
$$;

revoke all on function public.job_dashboard_counts() from public, anon, authenticated;
grant execute on function public.job_dashboard_counts() to service_role;
