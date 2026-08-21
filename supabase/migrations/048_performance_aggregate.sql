-- =============================================================================
-- Oryx Design — migration 048: performance_aggregate RPC
-- =============================================================================
-- SECURITY DEFINER aggregate for the Performance page. Computes all KPIs,
-- series, engineer/client rows, revision/workload/time analytics in Postgres
-- so the app does not transfer every job row.
--
-- Golden reference (must match exactly):
--   modules/performance/lib/aggregate-performance.ts
--
-- Tables: public.jobs (archived_at is null), public.clients, public.app_users.
-- plpgsql + CTE SELECT (STABLE forbids temp-table DDL; no CREATE TEMP).
-- No speculative indexes — jobs already indexed on date_created, status,
-- designer, client_id; tags use GIN (036).
-- =============================================================================

create or replace function public.performance_aggregate(
  p_from date,
  p_to date,
  p_engineer text default null,  -- null or 'all' = no filter; else exact designer_eff match
  p_client_id text default null,
  p_item_type text default null,
  p_tag text default null,
  p_status text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- STABLE: no temp-table DDL; pure SELECT via CTEs (maps to TS aggregate helpers).
  return (
  with
  -- ── Params (getPreviousPeriod + filter normalisation) ─────────────────────
  params as (
    select
      least(p_from, p_to) as d_from,
      greatest(p_from, p_to) as d_to,
      case
        when nullif(trim(coalesce(p_engineer, '')), '') is null then null
        when lower(trim(p_engineer)) = 'all' then null
        else trim(p_engineer)
      end as f_engineer,
      case
        when nullif(trim(coalesce(p_client_id, '')), '') is null then null
        when lower(trim(p_client_id)) = 'all' then null
        else trim(p_client_id)
      end as f_client_id,
      case
        when nullif(trim(coalesce(p_item_type, '')), '') is null then null
        when lower(trim(p_item_type)) = 'all' then null
        else trim(p_item_type)
      end as f_item_type,
      case
        when nullif(trim(coalesce(p_tag, '')), '') is null then null
        when lower(trim(p_tag)) = 'all' then null
        else trim(p_tag)
      end as f_tag,
      case
        when nullif(trim(coalesce(p_status, '')), '') is null then null
        when lower(trim(p_status)) = 'all' then null
        else trim(p_status)
      end as f_status
    where p_from is not null and p_to is not null
  ),
  bounds as (
    select
      d_from,
      d_to,
      -- prev_to = from - 1; prev_from = prev_to - (span - 1); span = (to-from)+1
      (d_from - 1) as prev_to,
      (d_from - 1) - (((d_to - d_from) + 1) - 1) as prev_from,
      d_to as today,
      to_char(d_to, 'YYYY-MM') as this_month,
      to_char(d_to, 'YYYY') as this_year,
      greatest(1::float8, (((d_to - d_from) + 1)::float8 / 7.0)) as weeks,
      (d_to - interval '6 months')::date as six_months_ago,
      (d_to + 7) as due_this_week_end,
      (d_to + 8) as due_next_start,
      (d_to + 14) as due_next_end,
      f_engineer,
      f_client_id,
      f_item_type,
      f_tag,
      f_status
    from params
  ),

  -- ── Filtered jobs (performanceRowsFromRawJobs + applyPerformanceFilters) ──
  filtered as (
    select
      j.id,
      j.status,
      j.item_type,
      j.client_id,
      j.parent_job_id,
      coalesce(j.tags, '{}'::text[]) as tags,
      ((j.date_created at time zone 'UTC')::date) as created_date,
      j.date_completed as completed_date,
      j.required_by_date as required_by_date,
      coalesce(nullif(trim(j.designer), ''), 'Unassigned') as designer_eff
    from public.jobs j
    cross join bounds b
    where j.archived_at is null
      and (b.f_engineer is null or coalesce(nullif(trim(j.designer), ''), 'Unassigned') = b.f_engineer)
      and (b.f_client_id is null or j.client_id = b.f_client_id)
      and (b.f_item_type is null or j.item_type = b.f_item_type)
      and (b.f_tag is null or b.f_tag = any (coalesce(j.tags, '{}'::text[])))
      and (b.f_status is null or j.status = b.f_status)
  ),
  jobs as (
    select
      f.*,
      (f.created_date >= b.d_from and f.created_date <= b.d_to) as in_period,
      (f.created_date >= b.prev_from and f.created_date <= b.prev_to) as in_prev,
      f.status in ('NEW_REQUEST', 'IN_DESIGN', 'CHECKING', 'READY_TO_SEND') as is_active,
      f.status = 'ISSUED' as is_complete,
      f.status = 'CHECKING' as is_awaiting_checking,
      f.status = 'READY_TO_SEND' as is_awaiting_client_info
    from filtered f
    cross join bounds b
  ),

  -- ── Buckets (dateRangeMonths / Weeks / Days) ──────────────────────────────
  month_buckets as (
    select to_char(m, 'YYYY-MM') as bucket
    from bounds b,
    lateral generate_series(
      date_trunc('month', b.d_from::timestamp),
      date_trunc('month', b.d_to::timestamp),
      interval '1 month'
    ) as m
  ),
  day_buckets as (
    select d::date as bucket
    from bounds b,
    lateral generate_series(b.d_from, b.d_to, interval '1 day') as d
  ),
  week_buckets as (
    select distinct (d.bucket - ((extract(dow from d.bucket)::int + 6) % 7)) as bucket
    from day_buckets d
  ),

  -- ── buildSeries over ALL filtered ─────────────────────────────────────────
  series_month as (
    select
      b.bucket as key,
      coalesce(c.cnt, 0)::int as value,
      coalesce(x.cnt, 0)::int as value_b
    from month_buckets b
    left join (
      select to_char(created_date, 'YYYY-MM') as k, count(*)::int as cnt
      from jobs group by 1
    ) c on c.k = b.bucket
    left join (
      select to_char(completed_date, 'YYYY-MM') as k, count(*)::int as cnt
      from jobs where completed_date is not null group by 1
    ) x on x.k = b.bucket
  ),
  series_week as (
    select
      b.bucket::text as key,
      coalesce(c.cnt, 0)::int as value,
      coalesce(x.cnt, 0)::int as value_b
    from week_buckets b
    left join (
      select (created_date - ((extract(dow from created_date)::int + 6) % 7)) as k,
             count(*)::int as cnt
      from jobs group by 1
    ) c on c.k = b.bucket
    left join (
      select (completed_date - ((extract(dow from completed_date)::int + 6) % 7)) as k,
             count(*)::int as cnt
      from jobs where completed_date is not null group by 1
    ) x on x.k = b.bucket
  ),
  series_day as (
    select
      b.bucket::text as key,
      coalesce(c.cnt, 0)::int as value,
      coalesce(x.cnt, 0)::int as value_b
    from day_buckets b
    left join (
      select created_date as k, count(*)::int as cnt from jobs group by 1
    ) c on c.k = b.bucket
    left join (
      select completed_date as k, count(*)::int as cnt
      from jobs where completed_date is not null group by 1
    ) x on x.k = b.bucket
  ),

  -- ── buildStatusBreakdown ──────────────────────────────────────────────────
  status_counts as (
    select status, count(*)::int as cnt from jobs group by status
  ),
  known_statuses as (
    select * from (values
      (1, 'NEW_REQUEST', 'New Request'),
      (2, 'IN_DESIGN', 'In Progress'),
      (3, 'CHECKING', 'Requires Checking'),
      (4, 'READY_TO_SEND', 'Ready to Send'),
      (5, 'ISSUED', 'Complete')
    ) as t(ord, status, label)
  ),
  status_rows as (
    select k.ord, k.status, k.label, coalesce(c.cnt, 0)::int as count
    from known_statuses k
    left join status_counts c on c.status = k.status
    union all
    select 100 + row_number() over (order by c.status), c.status, c.status, c.cnt
    from status_counts c
    where not exists (select 1 from known_statuses k where k.status = c.status)
  ),

  -- ── buildEngineerRows ─────────────────────────────────────────────────────
  directory_users as (
    select
      u.id as user_id,
      u.name,
      case upper(trim(coalesce(u.role, '')))
        when 'ADMIN' then 'ADMIN'
        when 'ENGINEER' then 'ENGINEER'
        when 'ACCOUNTS' then 'ACCOUNTS'
        else 'ENGINEER'
      end as role,
      lower(trim(u.name)) as name_key
    from public.app_users u
  ),
  user_by_name as (
    select distinct on (name_key)
      name_key, user_id, name, role
    from directory_users
    order by name_key, user_id desc
  ),
  job_eng as (
    select
      j.*,
      coalesce(ub.user_id, 'designer:' || lower(trim(j.designer_eff))) as engineer_id,
      case when ub.user_id is null then j.designer_eff else ub.name end as engineer_name,
      case when ub.user_id is null then 'ENGINEER' else ub.role end as engineer_role,
      (ub.user_id is not null) as from_directory
    from jobs j
    left join user_by_name ub on ub.name_key = lower(trim(j.designer_eff))
  ),
  seed_engineers as (
    select
      user_id,
      name,
      role,
      true as from_directory
    from directory_users
    union
    select distinct
      engineer_id,
      engineer_name,
      'ENGINEER',
      false
    from job_eng
    where not exists (
      select 1 from directory_users d where d.user_id = job_eng.engineer_id
    )
  ),
  eng_all as (
    select
      engineer_id,
      count(*) filter (where is_active)::int as jobs_assigned,
      count(*) filter (where is_awaiting_checking)::int as awaiting_checking,
      count(*) filter (where is_complete and item_type = 'SITE_VISIT')::int as site_visits_completed
    from job_eng
    group by engineer_id
  ),
  eng_period as (
    select
      engineer_id,
      count(*) filter (where is_complete)::int as jobs_completed,
      coalesce(
        round(avg(greatest(0, (completed_date - created_date)))
          filter (where is_complete and completed_date is not null)::numeric, 2),
        0
      )::float8 as avg_turnaround_days,
      count(distinct parent_job_id)
        filter (where is_complete and parent_job_id is not null)::int as revision_parents
    from job_eng
    where in_period
    group by engineer_id
  ),
  eng_prev as (
    select
      engineer_id,
      count(*) filter (where is_complete)::int as completion_prev
    from job_eng
    where in_prev
    group by engineer_id
  ),
  engineer_rows as (
    select
      s.user_id,
      s.name,
      s.role,
      s.from_directory,
      coalesce(p.jobs_completed, 0)::int as jobs_completed,
      coalesce(a.jobs_assigned, 0)::int as jobs_assigned,
      coalesce(p.avg_turnaround_days, 0::float8) as avg_turnaround_days,
      case
        when coalesce(p.jobs_completed, 0) = 0 then 0::float8
        else round(
          (coalesce(p.revision_parents, 0)::float8 / p.jobs_completed::float8)::numeric,
          2
        )::float8
      end as avg_revisions_per_job,
      coalesce(a.site_visits_completed, 0)::int as site_visits_completed,
      coalesce(a.awaiting_checking, 0)::int as awaiting_checking,
      round(
        (coalesce(p.jobs_completed, 0)::float8 / (select weeks from bounds))::numeric,
        2
      )::float8 as avg_jobs_per_week,
      case
        when (coalesce(p.jobs_completed, 0) - coalesce(pv.completion_prev, 0)) > 0 then 'up'
        when (coalesce(p.jobs_completed, 0) - coalesce(pv.completion_prev, 0)) < 0 then 'down'
        else 'flat'
      end as completion_trend
    from seed_engineers s
    left join eng_all a on a.engineer_id = s.user_id
    left join eng_period p on p.engineer_id = s.user_id
    left join eng_prev pv on pv.engineer_id = s.user_id
  ),

  -- ── buildClientRows ───────────────────────────────────────────────────────
  client_dir as (
    select
      c.id as client_id,
      c.name as client_name,
      (c.created_at at time zone 'UTC')::date as created_date,
      to_char((c.created_at at time zone 'UTC')::date, 'YYYY-MM') as created_month,
      case when c.active then 1 else 0 end as active
    from public.clients c
  ),
  client_job_stats as (
    select
      client_id,
      count(*)::int as total_jobs,
      count(*) filter (where in_period)::int as jobs_in_period,
      max(created_date) as last_job_date
    from jobs
    where client_id is not null
    group by client_id
  ),
  client_monthly as (
    select
      client_id,
      to_char(created_date, 'YYYY-MM') as month,
      count(*)::int as cnt
    from jobs
    where client_id is not null
    group by client_id, to_char(created_date, 'YYYY-MM')
  ),
  client_rows as (
    select
      s.client_id,
      d.client_name,
      s.total_jobs,
      s.jobs_in_period,
      s.last_job_date,
      (d.created_month = (select this_month from bounds)) as is_new_this_month,
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'key', mb.bucket,
              'label', mb.bucket,
              'value', coalesce(cm.cnt, 0)
            ) order by mb.bucket
          ),
          '[]'::jsonb
        )
        from month_buckets mb
        left join client_monthly cm
          on cm.client_id = s.client_id and cm.month = mb.bucket
      ) as monthly_points
    from client_job_stats s
    inner join client_dir d on d.client_id = s.client_id
  ),

  -- ── Revision analytics ────────────────────────────────────────────────────
  rev_by_parent as (
    select parent_job_id, count(*)::int as cnt
    from jobs
    where parent_job_id is not null
    group by parent_job_id
  ),
  rev_mode as (
    -- Match TS: mode by frequency; on tie prefer count value first seen in
    -- revisionsByParent values order (parent first-revision encounter order).
    select cnt
    from (
      select
        cnt,
        count(*)::int as freq,
        min(ord)::int as first_ord
      from (
        select
          cnt,
          row_number() over (
            order by first_seen, first_id
          ) as ord
        from (
          select
            parent_job_id,
            count(*)::int as cnt,
            min(created_date) as first_seen,
            min(id) as first_id
          from jobs
          where parent_job_id is not null
          group by parent_job_id
        ) parents
      ) ordered_counts
      group by cnt
      order by freq desc, first_ord asc
      limit 1
    ) m
  ),

  -- ── KPI inputs (buildKpis) ────────────────────────────────────────────────
  turn_cur as (
    select greatest(0, (completed_date - created_date))::float8 as d
    from jobs
    where in_period and is_complete and completed_date is not null
  ),
  turn_prev as (
    select greatest(0, (completed_date - created_date))::float8 as d
    from jobs
    where in_prev and is_complete and completed_date is not null
  ),
  kpi_raw as (
    select * from (values
      (
        1, 'total-created', 'Total Jobs Created',
        (select count(*)::float8 from jobs where in_period),
        (select count(*)::float8 from jobs where in_prev)
      ),
      (
        2, 'total-completed', 'Total Jobs Completed',
        (select count(*)::float8 from jobs where in_period and is_complete),
        (select count(*)::float8 from jobs where in_prev and is_complete)
      ),
      (
        3, 'active-jobs', 'Active Jobs',
        (select count(*)::float8 from jobs where is_active),
        (select count(*)::float8 from jobs where in_prev and is_active)
      ),
      (
        4, 'awaiting-checking', 'Jobs Awaiting Checking',
        (select count(*)::float8 from jobs where is_awaiting_checking),
        (select count(*)::float8 from jobs where in_prev and is_awaiting_checking)
      ),
      (
        5, 'awaiting-client-info', 'Jobs Awaiting Client Information',
        (select count(*)::float8 from jobs where is_awaiting_client_info),
        (select count(*)::float8 from jobs where in_prev and is_awaiting_client_info)
      ),
      (
        6, 'avg-completion-time', 'Average Completion Time',
        coalesce((select round(avg(d)::numeric, 2)::float8 from turn_cur), 0::float8),
        coalesce((select round(avg(d)::numeric, 2)::float8 from turn_prev), 0::float8)
      ),
      (
        7, 'completed-this-month', 'Jobs Completed This Month',
        (select count(*)::float8 from jobs
          where is_complete and completed_date is not null
            and to_char(completed_date, 'YYYY-MM') = (select this_month from bounds)),
        (select count(*)::float8 from jobs
          where in_prev and is_complete and completed_date is not null
            and to_char(completed_date, 'YYYY-MM') = (select this_month from bounds))
      ),
      (
        8, 'completed-this-year', 'Jobs Completed This Year',
        (select count(*)::float8 from jobs
          where is_complete and completed_date is not null
            and to_char(completed_date, 'YYYY') = (select this_year from bounds)),
        (select count(*)::float8 from jobs
          where in_prev and is_complete and completed_date is not null
            and to_char(completed_date, 'YYYY') = (select this_year from bounds))
      ),
      (
        9, 'avg-revisions-per-job', 'Average Revisions Per Job',
        coalesce((select round(avg(cnt)::numeric, 2)::float8 from rev_by_parent), 0::float8),
        coalesce((select round(avg(cnt)::numeric, 2)::float8 from rev_by_parent), 0::float8)
      ),
      (
        10, 'avg-turnaround', 'Average Turnaround Time',
        coalesce((select round(avg(d)::numeric, 2)::float8 from turn_cur), 0::float8),
        coalesce((select round(avg(d)::numeric, 2)::float8 from turn_prev), 0::float8)
      ),
      (
        11, 'active-clients', 'Number of Active Clients',
        (select count(*)::float8 from client_dir where active = 1),
        (select count(*)::float8 from client_dir where active = 1)
      ),
      (
        12, 'new-clients-month', 'New Clients This Month',
        (select count(*)::float8 from client_dir
          where created_month = (select this_month from bounds)),
        0::float8
      ),
      (
        13, 'site-visits-completed', 'Site Visits Completed',
        (select count(*)::float8 from jobs
          where in_period and item_type = 'SITE_VISIT' and is_complete),
        (select count(*)::float8 from jobs
          where in_prev and item_type = 'SITE_VISIT' and is_complete)
      ),
      (
        14, 'designs-completed-today', 'Designs Completed Today',
        (select count(*)::float8 from jobs
          where is_complete and completed_date = (select today from bounds)),
        (select count(*)::float8 from jobs
          where in_prev and is_complete and completed_date = (select today from bounds))
      )
    ) as t(ord, key, label, value, previous_value)
  ),

  -- ── Workload / time analytics ─────────────────────────────────────────────
  active_jobs as (
    select * from jobs where is_active
  ),
  wait_days as (
    select greatest(
      0,
      (coalesce(required_by_date, created_date) - created_date)
    )::float8 as d
    from jobs
    where in_period and is_awaiting_client_info
  ),

  -- ── Filter options from ALL non-archived jobs (unfiltered) ────────────────
  filter_tags as (
    select coalesce(
      (
        select jsonb_agg(t order by t)
        from (
          select distinct unnest(coalesce(tags, '{}'::text[])) as t
          from public.jobs
          where archived_at is null
        ) x
        where t is not null
      ),
      '[]'::jsonb
    ) as v
  ),
  filter_statuses as (
    select coalesce(
      (
        select jsonb_agg(s order by s)
        from (
          select distinct status as s
          from public.jobs
          where archived_at is null
        ) y
      ),
      '[]'::jsonb
    ) as v
  ),

  -- ── Assemble payload (empty when params missing) ──────────────────────────
  empty_payload as (
    select jsonb_build_object(
      'kpis', '[]'::jsonb,
      'jobsByMonth', '[]'::jsonb,
      'jobsByWeek', '[]'::jsonb,
      'jobsByDay', '[]'::jsonb,
      'jobsByStatus', '[]'::jsonb,
      'engineerRows', '[]'::jsonb,
      'engineerComparison', '[]'::jsonb,
      'topClients', '[]'::jsonb,
      'inactiveClients', '[]'::jsonb,
      'newClientsInPeriod', 0,
      'revisionAnalytics', jsonb_build_object(
        'totalRevisions', 0,
        'averageRevisionsPerJob', 0::float8,
        'jobsRequiringMultipleRevisions', 0,
        'mostCommonRevisionCount', 0,
        'revisionTrendByMonth', '[]'::jsonb
      ),
      'workloadAnalytics', jsonb_build_object(
        'jobsCreated', 0,
        'jobsCompleted', 0,
        'currentWorkload', 0,
        'outstandingJobs', 0,
        'averageAgeOfActiveJobs', 0::float8,
        'overdueJobs', 0,
        'dueThisWeek', 0,
        'dueNextWeek', 0
      ),
      'timeAnalytics', jsonb_build_object(
        'averageDesignTurnaroundDays', 0::float8,
        'medianTurnaroundDays', 0::float8,
        'fastestCompletionDays', 0,
        'longestCompletionDays', 0,
        'averageDaysWaitingForClientInformation', 0::float8
      ),
      'filterTags', '[]'::jsonb,
      'filterStatuses', '[]'::jsonb
    ) as payload
  ),
  full_payload as (
    select jsonb_build_object(
      'kpis', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'key', key,
              'label', label,
              'value', value,
              'previousValue', previous_value,
              'delta', value - previous_value,
              'deltaPct', case
                when previous_value = 0 then null
                else round((((value - previous_value) / previous_value) * 100)::numeric, 2)::float8
              end,
              'trend', case
                when (value - previous_value) > 0 then 'up'
                when (value - previous_value) < 0 then 'down'
                else 'flat'
              end
            ) order by ord
          ),
          '[]'::jsonb
        )
        from kpi_raw
      ),
      'jobsByMonth', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object('key', key, 'label', key, 'value', value, 'valueB', value_b)
            order by key
          ),
          '[]'::jsonb
        )
        from series_month
      ),
      'jobsByWeek', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object('key', key, 'label', key, 'value', value, 'valueB', value_b)
            order by key
          ),
          '[]'::jsonb
        )
        from series_week
      ),
      'jobsByDay', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object('key', key, 'label', key, 'value', value, 'valueB', value_b)
            order by key
          ),
          '[]'::jsonb
        )
        from series_day
      ),
      'jobsByStatus', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object('status', status, 'label', label, 'count', count)
            order by ord
          ),
          '[]'::jsonb
        )
        from status_rows
      ),
      'engineerRows', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'userId', user_id,
              'name', name,
              'role', role,
              'fromDirectory', from_directory,
              'jobsCompleted', jobs_completed,
              'jobsAssigned', jobs_assigned,
              'avgTurnaroundDays', avg_turnaround_days,
              'avgRevisionsPerJob', avg_revisions_per_job,
              'siteVisitsCompleted', site_visits_completed,
              'awaitingChecking', awaiting_checking,
              'avgJobsPerWeek', avg_jobs_per_week,
              'completionTrend', completion_trend
            ) order by jobs_completed desc, lower(name) asc, name asc
          ),
          '[]'::jsonb
        )
        from engineer_rows
      ),
      'engineerComparison', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object('key', user_id, 'label', name, 'value', jobs_completed)
            order by jobs_completed desc, lower(name) asc, name asc
          ),
          '[]'::jsonb
        )
        from (
          select * from engineer_rows
          order by jobs_completed desc, lower(name) asc, name asc
          limit 12
        ) top12
      ),
      'topClients', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'clientId', client_id,
              'clientName', client_name,
              'totalJobs', total_jobs,
              'jobsInPeriod', jobs_in_period,
              'monthlyPoints', monthly_points,
              'lastJobDate', last_job_date,
              'isNewThisMonth', is_new_this_month
            ) order by jobs_in_period desc, total_jobs desc
          ),
          '[]'::jsonb
        )
        from (
          select * from client_rows
          order by jobs_in_period desc, total_jobs desc
          limit 12
        ) topc
      ),
      'inactiveClients', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'clientId', client_id,
              'clientName', client_name,
              'totalJobs', total_jobs,
              'jobsInPeriod', jobs_in_period,
              'monthlyPoints', monthly_points,
              'lastJobDate', last_job_date,
              'isNewThisMonth', is_new_this_month
            ) order by lower(client_name) asc, client_name asc
          ),
          '[]'::jsonb
        )
        from client_rows
        where last_job_date is null
           or last_job_date < (select six_months_ago from bounds)
      ),
      'newClientsInPeriod', (
        select count(*)::int
        from client_dir
        where created_date >= (select d_from from bounds)
          and created_date <= (select d_to from bounds)
      ),
      'revisionAnalytics', jsonb_build_object(
        'totalRevisions', (select count(*)::int from jobs where parent_job_id is not null),
        'averageRevisionsPerJob', coalesce(
          (select round(avg(cnt)::numeric, 2)::float8 from rev_by_parent),
          0::float8
        ),
        'jobsRequiringMultipleRevisions', (
          select count(*)::int from rev_by_parent where cnt >= 2
        ),
        'mostCommonRevisionCount', coalesce((select cnt from rev_mode), 0),
        'revisionTrendByMonth', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'key', mb.bucket,
                'label', mb.bucket,
                'value', coalesce((
                  select count(*)::int
                  from jobs r
                  where r.parent_job_id is not null
                    and to_char(r.created_date, 'YYYY-MM') = mb.bucket
                ), 0)
              ) order by mb.bucket
            ),
            '[]'::jsonb
          )
          from month_buckets mb
        )
      ),
      'workloadAnalytics', jsonb_build_object(
        'jobsCreated', (select count(*)::int from jobs where in_period),
        'jobsCompleted', (select count(*)::int from jobs where in_period and is_complete),
        'currentWorkload', (select count(*)::int from active_jobs),
        'outstandingJobs', (select count(*)::int from active_jobs),
        'averageAgeOfActiveJobs', coalesce(
          (
            select round(avg(greatest(0, ((select today from bounds) - created_date)))::numeric, 2)::float8
            from active_jobs
          ),
          0::float8
        ),
        'overdueJobs', (
          select count(*)::int from active_jobs
          where required_by_date is not null
            and required_by_date < (select today from bounds)
        ),
        'dueThisWeek', (
          select count(*)::int from active_jobs
          where required_by_date is not null
            and required_by_date >= (select today from bounds)
            and required_by_date <= (select due_this_week_end from bounds)
        ),
        'dueNextWeek', (
          select count(*)::int from active_jobs
          where required_by_date is not null
            and required_by_date >= (select due_next_start from bounds)
            and required_by_date <= (select due_next_end from bounds)
        )
      ),
      'timeAnalytics', jsonb_build_object(
        'averageDesignTurnaroundDays', coalesce(
          (select round(avg(d)::numeric, 2)::float8 from turn_cur), 0::float8
        ),
        'medianTurnaroundDays', coalesce(
          (
            select round(
              (percentile_cont(0.5) within group (order by d))::numeric,
              2
            )::float8
            from turn_cur
          ),
          0::float8
        ),
        'fastestCompletionDays', coalesce((select min(d)::int from turn_cur), 0),
        'longestCompletionDays', coalesce((select max(d)::int from turn_cur), 0),
        'averageDaysWaitingForClientInformation', coalesce(
          (select round(avg(d)::numeric, 2)::float8 from wait_days), 0::float8
        )
      ),
      'filterTags', (select v from filter_tags),
      'filterStatuses', (select v from filter_statuses)
    ) as payload
    from bounds
  )
  select case
    when not exists (select 1 from bounds) then (select payload from empty_payload)
    else (select payload from full_payload)
  end
  );
end;
$$;

comment on function public.performance_aggregate(date, date, text, text, text, text, text) is
  'Performance page aggregates (SECURITY DEFINER). Matches modules/performance/lib/aggregate-performance.ts. service_role only.';

revoke all on function public.performance_aggregate(date, date, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.performance_aggregate(date, date, text, text, text, text, text)
  to service_role;

notify pgrst, 'reload schema';
