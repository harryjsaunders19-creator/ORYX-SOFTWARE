-- Oryx Design — migration 037: job documents + private Storage bucket
-- Metadata for every file attached to a job/revision family.
-- Files live in the private `job-files` bucket (service-role only).

-- ── Storage bucket ────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-files',
  'job-files',
  false,
  52428800,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream',
    'application/acad',
    'application/x-acad',
    'application/dxf',
    'image/vnd.dwg',
    'image/vnd.dxf',
    'message/rfc822',
    'application/vnd.ms-outlook',
    'text/plain'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── Metadata table ────────────────────────────────────────────────────────────
create table if not exists public.job_documents (
  id                  text primary key,
  root_job_id         text not null,
  job_id              text references public.jobs (id) on delete cascade,
  parent_job_id       text references public.parent_jobs (id) on delete cascade,
  work_item_id        text references public.work_items (id) on delete set null,
  revision_letter     text,
  filename            text not null,
  original_filename   text not null,
  mime_type           text not null,
  file_ext            text not null default '',
  file_size           bigint not null default 0,
  category            text not null default 'General',
  description         text,
  storage_path        text not null,
  uploaded_by         text not null,
  uploaded_by_name    text not null,
  email_subject       text,
  email_from          text,
  email_to            text,
  email_cc            text,
  email_date          timestamptz,
  email_preview       text,
  parse_status        text not null default 'none'
                      check (parse_status in ('none', 'ok', 'failed')),
  version_group_id    text,
  approval_status     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  constraint job_documents_storage_path_unique unique (storage_path),
  constraint job_documents_has_anchor check (
    job_id is not null or parent_job_id is not null
  )
);

create index if not exists idx_job_documents_root
  on public.job_documents (root_job_id, deleted_at, created_at desc);
create index if not exists idx_job_documents_job
  on public.job_documents (job_id) where deleted_at is null;
create index if not exists idx_job_documents_parent
  on public.job_documents (parent_job_id) where deleted_at is null;
create index if not exists idx_job_documents_work_item
  on public.job_documents (work_item_id) where deleted_at is null;
create index if not exists idx_job_documents_category
  on public.job_documents (category) where deleted_at is null;
create index if not exists idx_job_documents_filename
  on public.job_documents (lower(filename));
create index if not exists idx_job_documents_email_subject
  on public.job_documents (lower(email_subject)) where email_subject is not null;

drop trigger if exists job_documents_updated_at on public.job_documents;
create trigger job_documents_updated_at
  before update on public.job_documents
  for each row execute function public.set_updated_at();

alter table public.job_documents enable row level security;

drop policy if exists "Service role full access on job_documents" on public.job_documents;
create policy "Service role full access on job_documents"
  on public.job_documents for all to service_role
  using (true) with check (true);

comment on table public.job_documents is
  'Files attached to a job/revision family. Bytes live in the private job-files Storage bucket.';

notify pgrst, 'reload schema';
