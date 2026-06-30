-- =============================================================================
-- Oryx Design — Supabase migration 014: employee HR profiles
-- Enable with SUPABASE_EMPLOYEES=true after sync script
-- =============================================================================

create table if not exists public.employee_profiles (
  user_id                        text primary key references public.app_users (id) on delete cascade,
  employee_id                    text unique,
  profile_photo_path             text,
  first_name                     text,
  last_name                      text,
  preferred_name                 text,
  phone                          text,
  mobile                         text,
  date_of_birth                  text,
  gender                         text,
  nationality                    text,
  address                        text,
  city                           text,
  county                         text,
  postcode                       text,
  country                        text,
  emergency_contact_name         text,
  emergency_contact_phone        text,
  emergency_contact_relationship text,
  job_title                      text,
  department                     text,
  manager_id                     text references public.app_users (id) on delete set null,
  office_location                text,
  employment_type                text not null default 'FULL_TIME',
  employment_status              text not null default 'ACTIVE',
  start_date                     text,
  end_date                       text,
  probation_end_date             text,
  working_hours                  text,
  salary                         double precision,
  annual_leave_allowance         double precision not null default 25,
  leave_taken                    double precision not null default 0,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now()
);

create index if not exists idx_employee_profiles_department on public.employee_profiles (department);
create index if not exists idx_employee_profiles_status on public.employee_profiles (employment_status);
create index if not exists idx_employee_profiles_manager on public.employee_profiles (manager_id);
create index if not exists idx_employee_profiles_employee_id on public.employee_profiles (employee_id);

drop trigger if exists employee_profiles_updated_at on public.employee_profiles;
create trigger employee_profiles_updated_at
  before update on public.employee_profiles
  for each row execute function public.set_updated_at();

alter table public.employee_profiles enable row level security;
drop policy if exists "Service role full access on employee_profiles" on public.employee_profiles;
create policy "Service role full access on employee_profiles"
  on public.employee_profiles for all to service_role using (true) with check (true);

create table if not exists public.employee_skills (
  id                text primary key,
  user_id           text not null references public.app_users (id) on delete cascade,
  name              text not null,
  level             text,
  years_experience  double precision,
  category          text not null default 'SKILL',
  certificate_path  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_employee_skills_user on public.employee_skills (user_id);

drop trigger if exists employee_skills_updated_at on public.employee_skills;
create trigger employee_skills_updated_at
  before update on public.employee_skills
  for each row execute function public.set_updated_at();

alter table public.employee_skills enable row level security;
drop policy if exists "Service role full access on employee_skills" on public.employee_skills;
create policy "Service role full access on employee_skills"
  on public.employee_skills for all to service_role using (true) with check (true);

create table if not exists public.employee_documents (
  id               text primary key,
  user_id          text not null references public.app_users (id) on delete cascade,
  name             text not null,
  category         text not null default 'OTHER',
  file_path        text not null,
  mime_type        text not null,
  file_size        integer not null default 0,
  restricted       boolean not null default false,
  uploaded_by      text not null,
  uploaded_by_name text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_employee_documents_user on public.employee_documents (user_id);

drop trigger if exists employee_documents_updated_at on public.employee_documents;
create trigger employee_documents_updated_at
  before update on public.employee_documents
  for each row execute function public.set_updated_at();

alter table public.employee_documents enable row level security;
drop policy if exists "Service role full access on employee_documents" on public.employee_documents;
create policy "Service role full access on employee_documents"
  on public.employee_documents for all to service_role using (true) with check (true);

create table if not exists public.employee_notes (
  id               text primary key,
  user_id          text not null references public.app_users (id) on delete cascade,
  content          text not null,
  created_by       text not null,
  created_by_name  text not null,
  updated_by       text,
  updated_by_name  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_employee_notes_user on public.employee_notes (user_id);

drop trigger if exists employee_notes_updated_at on public.employee_notes;
create trigger employee_notes_updated_at
  before update on public.employee_notes
  for each row execute function public.set_updated_at();

alter table public.employee_notes enable row level security;
drop policy if exists "Service role full access on employee_notes" on public.employee_notes;
create policy "Service role full access on employee_notes"
  on public.employee_notes for all to service_role using (true) with check (true);

create table if not exists public.employee_activity (
  id                text primary key,
  user_id           text not null references public.app_users (id) on delete cascade,
  action            text not null,
  detail            text,
  performed_by      text not null,
  performed_by_name text not null,
  created_at        timestamptz not null default now()
);

create index if not exists idx_employee_activity_user on public.employee_activity (user_id, created_at desc);

alter table public.employee_activity enable row level security;
drop policy if exists "Service role full access on employee_activity" on public.employee_activity;
create policy "Service role full access on employee_activity"
  on public.employee_activity for all to service_role using (true) with check (true);

notify pgrst, 'reload schema';
