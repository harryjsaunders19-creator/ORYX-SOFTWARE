-- Oryx Design — migration 029: job billable flag for revision invoicing
-- Revisions only enter Ready for Invoicing when billable=true and status=ISSUED.
-- Existing revision rows that already have a handoff stay billable; others default false.

alter table public.jobs
  add column if not exists billable boolean not null default true;

-- New default for revisions: not chargeable unless marked. Preserve handoff queue.
update public.jobs
set billable = false
where parent_job_id is not null;

update public.jobs j
set billable = true
where j.parent_job_id is not null
  and exists (
    select 1 from public.billing_handoffs b where b.source_job_id = j.id
  );

comment on column public.jobs.billable is
  'When true and status=ISSUED, creates a Ready for Invoicing handoff. Originals default true; new revisions default false.';
