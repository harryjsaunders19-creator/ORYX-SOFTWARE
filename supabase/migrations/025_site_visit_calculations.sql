-- Saved site visit cost calculations (shared across all users).

create table if not exists public.site_visit_calculations (
  id                       text primary key,
  label                    text,
  created_by               text not null references public.app_users(id),
  created_by_name          text,
  site_address             text not null,
  site_lat                 double precision,
  site_lng                 double precision,
  one_way_distance_miles   numeric(8,2) not null,
  one_way_duration_minutes numeric(8,1) not null,
  site_hours               numeric(4,2) not null,
  mileage_rate             numeric(6,4) not null default 0.45,
  hourly_rate              numeric(8,2) not null default 95,
  vat_rate                 numeric(5,4) not null default 0.2,
  mileage_cost             numeric(10,2) not null,
  labour_cost              numeric(10,2) not null,
  subtotal                 numeric(10,2) not null,
  vat                      numeric(10,2) not null,
  grand_total              numeric(10,2) not null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_site_visit_calc_created
  on public.site_visit_calculations (created_at desc);

drop trigger if exists site_visit_calculations_updated_at on public.site_visit_calculations;
create trigger site_visit_calculations_updated_at
  before update on public.site_visit_calculations
  for each row execute function public.set_updated_at();

alter table public.site_visit_calculations enable row level security;
drop policy if exists "Service role full access on site_visit_calculations" on public.site_visit_calculations;
create policy "Service role full access on site_visit_calculations"
  on public.site_visit_calculations for all to service_role using (true) with check (true);
