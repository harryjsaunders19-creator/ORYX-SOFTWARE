-- =============================================================================
-- Oryx Design — Supabase migration 023: job list sort key
-- Enables paginated drawing-number sort without loading all job rows.
-- =============================================================================

alter table public.jobs
  add column if not exists list_sort_key text;

update public.jobs j
set list_sort_key = sub.key
from (
  select
    id,
    case
      when (
        case when parent_job_id is not null
          then regexp_replace(drawing_number, ' Rev [A-Z]$', '')
          else drawing_number
        end
      ) ~ '^\d{2}/ORYX/\d{2}/\d+$' then
        lpad(
          (regexp_match(
            case when parent_job_id is not null
              then regexp_replace(drawing_number, ' Rev [A-Z]$', '')
              else drawing_number
            end,
            '^\d{2}/ORYX/\d{2}/(\d+)$'
          ))[1],
          4, '0'
        )
        || '-'
        || lpad(
          case
            when revision_letter ~ '^[A-Z]$'
              then (ascii(revision_letter) - 64)::text
            else '0'
          end,
          2, '0'
        )
      else 'Z' || drawing_number || coalesce('-' || revision_letter, '')
    end as key
  from public.jobs
) sub
where j.id = sub.id
  and (j.list_sort_key is null or j.list_sort_key <> sub.key);

create index if not exists idx_jobs_list_sort_key
  on public.jobs (list_sort_key, created_at);

notify pgrst, 'reload schema';
