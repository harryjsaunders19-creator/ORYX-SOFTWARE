-- Atomic sequence counters for drawing numbers and reference numbers (Supabase-only mode).

create table if not exists public.app_sequences (
  name text primary key,
  value integer not null default 0
);

create or replace function public.bump_app_sequence(p_name text, p_delta int default 1)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v integer;
begin
  insert into app_sequences (name, value)
  values (p_name, p_delta)
  on conflict (name) do update
    set value = app_sequences.value + excluded.value
  returning value into v;
  return v;
end;
$$;

grant execute on function public.bump_app_sequence(text, int) to service_role;
revoke execute on function public.bump_app_sequence(text, int) from public, anon, authenticated;
