-- Add controlled Type of Works fields to quotes (mirrors Job.typeOfWorks).

alter table public.quotes
  add column if not exists type_of_works text,
  add column if not exists custom_type_description text;

notify pgrst, 'reload schema';
