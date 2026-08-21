-- =============================================================================
-- Oryx Design — migration 046: Jobs Register scoped page (current-work in SQL)
-- =============================================================================
-- Replaces the application-layer path that loaded up to 5,000 slim originals,
-- enriched current-work in Node, then sliced a page.
--
-- Semantics (must match modules/jobs/lib/jobs-list-overlay.ts + current-work.ts):
--   * Candidates = non-archived originals (parent_job_id IS NULL, archived_at IS NULL)
--   * Current work = latest non-ISSUED revision by letter rank then updated_at;
--     else active original; else none
--   * Status / unassigned / deadline filters use current display fields
--   * Scope counts tallied after those filters, before scope tab filter
--   * Search / client / item_type / type_of_works apply to the original row
--   * Revisions are NOT filtered by archived_at (matches sidecar fetch)
--   * due_this_week uses caller-supplied Mon–Sun anchors (JS calendar week)
--
-- SECURITY DEFINER: service_role only (same model as job_stats_for_clients).
-- search_path locked to public.
-- =============================================================================

create or replace function public.jobs_revision_letter_rank(p_letter text)
returns integer
language sql
immutable
parallel safe
as $$
  select case upper(coalesce(nullif(trim(p_letter), ''), ''))
    when 'A' then 0  when 'B' then 1  when 'C' then 2  when 'D' then 3
    when 'E' then 4  when 'F' then 5  when 'G' then 6  when 'H' then 7
    when 'I' then 8  when 'J' then 9  when 'K' then 10 when 'L' then 11
    when 'M' then 12 when 'N' then 13 when 'O' then 14 when 'P' then 15
    when 'Q' then 16 when 'R' then 17 when 'S' then 18 when 'T' then 19
    when 'U' then 20 when 'V' then 21 when 'W' then 22 when 'X' then 23
    when 'Y' then 24 when 'Z' then 25
    else -1
  end;
$$;

comment on function public.jobs_revision_letter_rank(text) is
  'Rank for ORYX revision letters A–Z; unknown/null => -1. Matches compareRevisionLetters.';

create or replace function public.jobs_list_scoped_page(
  p_scope text default 'all',
  p_page integer default 1,
  p_page_size integer default 25,
  p_search text default null,
  p_search_tags text[] default null,
  p_status text default null,
  p_client_id text default null,
  p_item_type text default null,
  p_type_of_works text default null,
  p_unassigned boolean default false,
  p_overdue boolean default false,
  p_due_today boolean default false,
  p_due_this_week boolean default false,
  p_sort_dir text default 'asc',
  p_include_counts boolean default true,
  p_today date default null,
  p_week_start date default null,
  p_week_end date default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      case
        when lower(coalesce(nullif(trim(p_scope), ''), 'all'))
          in ('all', 'active', 'revisions', 'completed')
        then lower(coalesce(nullif(trim(p_scope), ''), 'all'))
        else 'all'
      end as scope,
      greatest(coalesce(p_page, 1), 1) as page,
      least(greatest(coalesce(p_page_size, 25), 1), 5000) as page_size,
      lower(coalesce(p_sort_dir, 'asc')) <> 'desc' as sort_asc,
      nullif(trim(coalesce(p_search, '')), '') as search,
      coalesce(p_today, (timezone('utc', now()))::date) as today,
      coalesce(p_week_start, coalesce(p_today, (timezone('utc', now()))::date)) as week_start,
      coalesce(p_week_end, coalesce(p_today, (timezone('utc', now()))::date)) as week_end,
      coalesce(p_unassigned, false) as unassigned,
      coalesce(p_overdue, false) as overdue,
      coalesce(p_due_today, false) as due_today,
      coalesce(p_due_this_week, false) as due_this_week,
      coalesce(p_include_counts, true) as include_counts,
      nullif(trim(coalesce(p_status, '')), '') as status,
      nullif(trim(coalesce(p_client_id, '')), '') as client_id,
      nullif(trim(coalesce(p_item_type, '')), '') as item_type,
      nullif(trim(coalesce(p_type_of_works, '')), '') as type_of_works
  ),
  originals as (
    select
      j.id,
      j.status,
      j.designer,
      j.required_by_date,
      j.list_sort_key,
      j.created_at
    from public.jobs j
    cross join params p
    where j.parent_job_id is null
      and j.archived_at is null
      and (p.client_id is null or j.client_id = p.client_id)
      and (p.item_type is null or j.item_type = p.item_type)
      and (p.type_of_works is null or j.type_of_works = p.type_of_works)
      and (
        p.search is null
        or strpos(lower(coalesce(j.drawing_number, '')), lower(p.search)) > 0
        or strpos(lower(coalesce(j.address, '')), lower(p.search)) > 0
        or strpos(lower(coalesce(j.client_company, '')), lower(p.search)) > 0
        or strpos(lower(coalesce(j.requested_by, '')), lower(p.search)) > 0
        or strpos(lower(coalesce(j.type_of_works, '')), lower(p.search)) > 0
        or strpos(lower(coalesce(j.custom_type_description, '')), lower(p.search)) > 0
        or strpos(lower(coalesce(j.designer, '')), lower(p.search)) > 0
        or strpos(lower(coalesce(j.quote_reference, '')), lower(p.search)) > 0
        or (
          p_search_tags is not null
          and cardinality(p_search_tags) > 0
          and j.tags is not null
          and j.tags && p_search_tags
        )
      )
  ),
  -- Latest active revision per parent. No archived_at filter (Node sidecar parity).
  latest_active_rev as (
    select distinct on (r.parent_job_id)
      r.parent_job_id,
      r.id as rev_id,
      r.status as rev_status,
      r.designer as rev_designer,
      r.required_by_date as rev_required_by_date
    from public.jobs r
    where r.parent_job_id is not null
      and r.status is distinct from 'ISSUED'
      and r.parent_job_id in (select id from originals)
    order by
      r.parent_job_id,
      public.jobs_revision_letter_rank(r.revision_letter) desc,
      r.updated_at desc nulls last
  ),
  current_work as (
    select
      o.id,
      o.list_sort_key,
      o.created_at,
      case
        when lar.rev_id is not null then 'revision'
        when o.status is distinct from 'ISSUED' then 'original'
        else 'none'
      end as work_type,
      case
        when lar.rev_id is not null then coalesce(lar.rev_status, o.status)
        else o.status
      end as current_status,
      case
        when lar.rev_id is not null then coalesce(lar.rev_designer, o.designer)
        else o.designer
      end as current_designer,
      case
        when lar.rev_id is not null then coalesce(lar.rev_required_by_date, o.required_by_date)
        else o.required_by_date
      end as current_required_by_date
    from originals o
    left join latest_active_rev lar on lar.parent_job_id = o.id
  ),
  filtered as (
    select c.*
    from current_work c
    cross join params p
    where
      (p.status is null or c.current_status = p.status)
      and (not p.unassigned or trim(coalesce(c.current_designer, '')) = '')
      and (
        not p.overdue
        or (
          c.current_status is distinct from 'ISSUED'
          and c.current_required_by_date is not null
          and c.current_required_by_date < p.today
        )
      )
      and (
        not p.due_today
        or (
          c.current_status is distinct from 'ISSUED'
          and c.current_required_by_date = p.today
        )
      )
      and (
        not p.due_this_week
        or (
          c.current_status is distinct from 'ISSUED'
          and c.current_required_by_date is not null
          and c.current_required_by_date >= p.week_start
          and c.current_required_by_date <= p.week_end
        )
      )
  ),
  counted as (
    select
      count(*)::integer as total_all,
      count(*) filter (where work_type is distinct from 'none')::integer as total_active,
      count(*) filter (where work_type = 'revision')::integer as total_revisions,
      count(*) filter (where work_type = 'none')::integer as total_completed
    from filtered
  ),
  scoped as (
    select f.*
    from filtered f
    cross join params p
    where
      p.scope = 'all'
      or (p.scope = 'active' and f.work_type is distinct from 'none')
      or (p.scope = 'revisions' and f.work_type = 'revision')
      or (p.scope = 'completed' and f.work_type = 'none')
  ),
  ordered as (
    select
      s.id,
      row_number() over (
        order by
          case when (select sort_asc from params) then s.list_sort_key end asc nulls last,
          case when not (select sort_asc from params) then s.list_sort_key end desc nulls last,
          case when (select sort_asc from params) then s.created_at end asc nulls last,
          case when not (select sort_asc from params) then s.created_at end desc nulls last,
          s.id
      ) as rn,
      count(*) over ()::integer as scoped_total
    from scoped s
  )
  select jsonb_build_object(
    'ids', coalesce(
      (
        select jsonb_agg(o.id order by o.rn)
        from ordered o
        cross join params p
        where o.rn > (p.page - 1) * p.page_size
          and o.rn <= p.page * p.page_size
      ),
      '[]'::jsonb
    ),
    'total', coalesce((select scoped_total from ordered limit 1), 0),
    'scope_counts', case
      when (select include_counts from params) then
        jsonb_build_object(
          'all', (select total_all from counted),
          'active', (select total_active from counted),
          'revisions', (select total_revisions from counted),
          'completed', (select total_completed from counted)
        )
      else null
    end
  );
$$;

comment on function public.jobs_list_scoped_page is
  'Paged Jobs Register IDs after current-work scope/status/deadline filters. No app-layer 5k scan.';

revoke all on function public.jobs_revision_letter_rank(text) from public, anon, authenticated;
grant execute on function public.jobs_revision_letter_rank(text) to service_role;

revoke all on function public.jobs_list_scoped_page(
  text, integer, integer, text, text[], text, text, text, text,
  boolean, boolean, boolean, boolean, text, boolean, date, date, date
) from public, anon, authenticated;

grant execute on function public.jobs_list_scoped_page(
  text, integer, integer, text, text[], text, text, text, text,
  boolean, boolean, boolean, boolean, text, boolean, date, date, date
) to service_role;

-- Speeds latest-active-revision DISTINCT ON used by jobs_list_scoped_page.
create index if not exists idx_jobs_revisions_active_current_work
  on public.jobs (parent_job_id, revision_letter, updated_at desc)
  where parent_job_id is not null
    and status is distinct from 'ISSUED';

notify pgrst, 'reload schema';
