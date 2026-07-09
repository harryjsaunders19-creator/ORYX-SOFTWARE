-- Multiple contact people per client company.

create table if not exists public.client_contacts (
  id          text primary key,
  client_id   text not null references public.clients (id) on delete cascade,
  name        text not null,
  email       text,
  phone       text,
  role        text,
  is_primary  boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_client_contacts_client on public.client_contacts (client_id);
create index if not exists idx_client_contacts_primary on public.client_contacts (client_id, is_primary);

drop trigger if exists client_contacts_updated_at on public.client_contacts;
create trigger client_contacts_updated_at
  before update on public.client_contacts
  for each row execute function public.set_updated_at();

alter table public.client_contacts enable row level security;
drop policy if exists "Service role full access on client_contacts" on public.client_contacts;
create policy "Service role full access on client_contacts"
  on public.client_contacts for all to service_role
  using (true) with check (true);

-- Backfill one contact row from legacy client fields.
insert into public.client_contacts (
  id, client_id, name, email, phone, role, is_primary, sort_order, created_at, updated_at
)
select
  c.id || '-primary',
  c.id,
  coalesce(nullif(trim(c.contact_name), ''), 'Main contact'),
  c.email,
  c.phone,
  null,
  true,
  0,
  c.created_at,
  c.updated_at
from public.clients c
where (
  nullif(trim(c.contact_name), '') is not null
  or nullif(trim(c.email), '') is not null
  or nullif(trim(c.phone), '') is not null
)
and not exists (
  select 1 from public.client_contacts cc where cc.client_id = c.id
);
