-- 033: Atomic quote → job convert (audit M5).
-- Inserts the job + initial status history and links the quote in one transaction.
-- Fails (rolls back) if the quote is missing, not ACCEPTED, or already converted.

create or replace function public.convert_quote_to_job(
  p_quote_id text,
  p_job jsonb,
  p_history_id text,
  p_changed_by text default 'System'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quotes%rowtype;
  v_job_id text;
  v_updated integer;
begin
  if p_quote_id is null or length(trim(p_quote_id)) = 0 then
    raise exception 'convert_quote_to_job: quote id required';
  end if;
  if p_job is null or p_job->>'id' is null then
    raise exception 'convert_quote_to_job: job payload required';
  end if;

  v_job_id := p_job->>'id';

  select * into v_quote
  from public.quotes
  where id = p_quote_id
  for update;

  if not found then
    raise exception 'convert_quote_to_job: quote not found';
  end if;

  if v_quote.status is distinct from 'ACCEPTED' then
    raise exception 'convert_quote_to_job: quote is not ACCEPTED';
  end if;

  if v_quote.job_id is not null then
    raise exception 'convert_quote_to_job: quote already converted';
  end if;

  insert into public.jobs (
    id, drawing_number, item_type, address, type_of_works, custom_type_description,
    legacy_type_of_works, client_company, client_id, requested_by, status, designer,
    date_created, date_completed, notes, quote_value, quote_reference, quote_date,
    commercial_notes, variation_fees, additional_charges, invoice_id, billing_status,
    billing_batch_id, requested_date, required_by_date, parent_job_id, revision_letter,
    billable, archived_at, archived_by, latitude, longitude, geocoded_at, geocoded_address,
    site_name, site_address, location_status, location_source, list_sort_key,
    created_at, updated_at
  )
  values (
    v_job_id,
    coalesce(p_job->>'drawing_number', 'TBC'),
    coalesce(p_job->>'item_type', 'DESIGN'),
    coalesce(p_job->>'address', 'Address TBC'),
    coalesce(p_job->>'type_of_works', 'Other'),
    nullif(p_job->>'custom_type_description', ''),
    nullif(p_job->>'legacy_type_of_works', ''),
    coalesce(p_job->>'client_company', ''),
    nullif(p_job->>'client_id', ''),
    coalesce(p_job->>'requested_by', ''),
    coalesce(p_job->>'status', 'NEW_REQUEST'),
    coalesce(p_job->>'designer', ''),
    coalesce((p_job->>'date_created')::timestamptz, now()),
    nullif(p_job->>'date_completed', '')::date,
    nullif(p_job->>'notes', ''),
    nullif(p_job->>'quote_value', '')::numeric,
    nullif(p_job->>'quote_reference', ''),
    nullif(p_job->>'quote_date', '')::date,
    nullif(p_job->>'commercial_notes', ''),
    nullif(p_job->>'variation_fees', '')::numeric,
    nullif(p_job->>'additional_charges', '')::numeric,
    nullif(p_job->>'invoice_id', ''),
    nullif(p_job->>'billing_status', ''),
    nullif(p_job->>'billing_batch_id', ''),
    nullif(p_job->>'requested_date', '')::date,
    nullif(p_job->>'required_by_date', '')::date,
    nullif(p_job->>'parent_job_id', ''),
    nullif(p_job->>'revision_letter', ''),
    coalesce((p_job->>'billable')::boolean, true),
    null,
    null,
    null,
    null,
    null,
    null,
    nullif(p_job->>'site_name', ''),
    nullif(p_job->>'site_address', ''),
    null,
    null,
    nullif(p_job->>'list_sort_key', ''),
    coalesce((p_job->>'created_at')::timestamptz, now()),
    coalesce((p_job->>'updated_at')::timestamptz, now())
  );

  insert into public.status_history (
    id, job_id, from_status, to_status, changed_by, changed_at, note
  )
  values (
    coalesce(nullif(p_history_id, ''), gen_random_uuid()::text),
    v_job_id,
    null,
    coalesce(p_job->>'status', 'NEW_REQUEST'),
    coalesce(nullif(p_changed_by, ''), 'System'),
    coalesce((p_job->>'created_at')::timestamptz, now()),
    null
  );

  update public.quotes
  set
    job_id = v_job_id,
    updated_at = now()
  where id = p_quote_id
    and job_id is null
    and status = 'ACCEPTED';

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'convert_quote_to_job: failed to link quote (already converted or status changed)';
  end if;

  -- Optional column from migration 030 — ignore if absent (handled by app best-effort).
  begin
    update public.quotes
    set parent_job_id = v_job_id
    where id = p_quote_id
      and parent_job_id is null;
  exception
    when undefined_column then
      null;
  end;

  return jsonb_build_object(
    'job_id', v_job_id,
    'quote_id', p_quote_id,
    'drawing_number', p_job->>'drawing_number'
  );
end;
$$;

revoke all on function public.convert_quote_to_job(text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.convert_quote_to_job(text, jsonb, text, text)
  to service_role;
