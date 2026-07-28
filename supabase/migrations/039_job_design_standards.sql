-- 039: Structured design standards field for CAT II check sheets.
alter table public.jobs
  add column if not exists design_standards text;
