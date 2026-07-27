-- Oryx Design — migration 036: multi-select job tags
-- Controlled list lives in lib/constants.ts (JOB_TAGS). Independent of type_of_works.

alter table public.jobs
  add column if not exists tags text[] not null default '{}';

alter table public.parent_jobs
  add column if not exists tags text[] not null default '{}';

create index if not exists idx_jobs_tags on public.jobs using gin (tags);
create index if not exists idx_parent_jobs_tags on public.parent_jobs using gin (tags);

comment on column public.jobs.tags is
  'Multi-select scaffold/site labels from the controlled JOB_TAGS list (e.g. Temporary Roof, Network Rail).';

comment on column public.parent_jobs.tags is
  'Multi-select scaffold/site labels from the controlled JOB_TAGS list.';

notify pgrst, 'reload schema';
