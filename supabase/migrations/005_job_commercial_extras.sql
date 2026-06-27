-- Variation fees and additional charges on jobs (commercial extras).

alter table public.jobs
  add column if not exists variation_fees numeric,
  add column if not exists additional_charges numeric;

notify pgrst, 'reload schema';
