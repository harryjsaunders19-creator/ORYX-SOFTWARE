-- =============================================================================
-- Oryx Design — migration 047: pg_trgm GIN indexes for substring search
-- =============================================================================
-- Problem: daily search uses leading+trailing wildcards (ILIKE '%term%' /
-- PostgREST .ilike.%term%). Btree indexes cannot help those predicates.
--
-- Evidence (PGlite / Postgres planner on ~5–8k fixture rows):
--   * strpos(lower(col), lower(term)) > 0  → Seq Scan even with gin_trgm
--   * col ILIKE '%term%'                   → Bitmap Index Scan + BitmapOr
--     when selective and every OR column is covered by gin_trgm_ops
--   * Incomplete OR coverage (some columns unindexed) → Seq Scan
--
-- Therefore:
--   1) Enable pg_trgm
--   2) Add focused GIN trigram indexes on columns actually searched with %term%
--   3) Rewrite jobs_list_scoped_page search from strpos → ILIKE ESCAPE '\'
--      (same case-insensitive substring semantics; %/_/\ treated as literals)
--
-- Index build: plain CREATE INDEX IF NOT EXISTS (not CONCURRENTLY).
-- Supabase migration runners wrap statements in a transaction; CONCURRENTLY
-- is not supported inside a transaction. Current ORYX volumes are modest —
-- a brief SHARE lock during build is acceptable.
--
-- Security: indexes only. RPC grants unchanged (service_role execute).
-- =============================================================================

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Jobs — classic list (postgrestOrIlike) + jobs_list_scoped_page OR search
-- All OR arms must be indexed for BitmapOr; otherwise planner falls back to
-- Seq Scan. Tags already use GIN array overlap (036_job_tags.sql).
-- ---------------------------------------------------------------------------
create index if not exists idx_jobs_drawing_number_trgm
  on public.jobs using gin (drawing_number gin_trgm_ops);

create index if not exists idx_jobs_address_trgm
  on public.jobs using gin (address gin_trgm_ops);

create index if not exists idx_jobs_client_company_trgm
  on public.jobs using gin (client_company gin_trgm_ops);

create index if not exists idx_jobs_requested_by_trgm
  on public.jobs using gin (requested_by gin_trgm_ops);

create index if not exists idx_jobs_type_of_works_trgm
  on public.jobs using gin (type_of_works gin_trgm_ops);

create index if not exists idx_jobs_custom_type_description_trgm
  on public.jobs using gin (custom_type_description gin_trgm_ops);

create index if not exists idx_jobs_designer_trgm
  on public.jobs using gin (designer gin_trgm_ops);

create index if not exists idx_jobs_quote_reference_trgm
  on public.jobs using gin (quote_reference gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Clients — directory OR + typeahead on name_lower
-- ---------------------------------------------------------------------------
create index if not exists idx_clients_name_lower_trgm
  on public.clients using gin (name_lower gin_trgm_ops);

create index if not exists idx_clients_contact_name_trgm
  on public.clients using gin (contact_name gin_trgm_ops);

create index if not exists idx_clients_email_trgm
  on public.clients using gin (email gin_trgm_ops);

create index if not exists idx_clients_phone_trgm
  on public.clients using gin (phone gin_trgm_ops);

create index if not exists idx_clients_account_code_trgm
  on public.clients using gin (account_code gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Quotes — list OR (quote_number, client_company, address, description)
-- ---------------------------------------------------------------------------
create index if not exists idx_quotes_quote_number_trgm
  on public.quotes using gin (quote_number gin_trgm_ops);

create index if not exists idx_quotes_client_company_trgm
  on public.quotes using gin (client_company gin_trgm_ops);

create index if not exists idx_quotes_address_trgm
  on public.quotes using gin (address gin_trgm_ops);

create index if not exists idx_quotes_description_trgm
  on public.quotes using gin (description gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- jobs_list_scoped_page: use ILIKE so gin_trgm_ops can apply.
-- Substring + case-insensitivity unchanged vs prior strpos(lower(..), lower(..)).
-- Escape % _ \ so user input stays literal (parity with strpos / PostgREST escape).
-- Grants preserved exactly.
-- ---------------------------------------------------------------------------
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
      case
        when nullif(trim(coalesce(p_search, '')), '') is null then null
        else
          '%'
          || replace(
               replace(
                 replace(trim(p_search), E'\\', E'\\\\'),
                 '%', E'\\%'
               ),
               '_', E'\\_'
             )
          || '%'
      end as search_pat,
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
        p.search_pat is null
        or coalesce(j.drawing_number, '')          ilike p.search_pat escape E'\\'
        or coalesce(j.address, '')                 ilike p.search_pat escape E'\\'
        or coalesce(j.client_company, '')          ilike p.search_pat escape E'\\'
        or coalesce(j.requested_by, '')            ilike p.search_pat escape E'\\'
        or coalesce(j.type_of_works, '')           ilike p.search_pat escape E'\\'
        or coalesce(j.custom_type_description, '') ilike p.search_pat escape E'\\'
        or coalesce(j.designer, '')                ilike p.search_pat escape E'\\'
        or coalesce(j.quote_reference, '')         ilike p.search_pat escape E'\\'
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
  'Paged Jobs Register IDs after current-work scope/status/deadline filters. Search uses ILIKE for pg_trgm.';

revoke all on function public.jobs_list_scoped_page(
  text, integer, integer, text, text[], text, text, text, text,
  boolean, boolean, boolean, boolean, text, boolean, date, date, date
) from public, anon, authenticated;

grant execute on function public.jobs_list_scoped_page(
  text, integer, integer, text, text[], text, text, text, text,
  boolean, boolean, boolean, boolean, text, boolean, date, date, date
) to service_role;

notify pgrst, 'reload schema';
