-- 032: Audit follow-ups — atomic rate limiting + transactional billing export commit.
-- Addresses production-readiness audit M10 (rate-limit race) and H2 (export integrity).

-- ── Atomic rate limit check (single row lock) ─────────────────────────────────
create or replace function public.check_rate_limit(
  p_rate_key text,
  p_window_ms bigint,
  p_max_attempts integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_reset_at timestamptz;
  v_count integer;
begin
  if p_rate_key is null or length(trim(p_rate_key)) = 0 then
    return true;
  end if;
  if p_window_ms is null or p_window_ms <= 0 or p_max_attempts is null or p_max_attempts <= 0 then
    return true;
  end if;

  select reset_at, attempt_count
  into v_reset_at, v_count
  from public.login_rate_limits
  where rate_key = p_rate_key
  for update;

  if not found or v_reset_at <= v_now then
    insert into public.login_rate_limits (rate_key, attempt_count, reset_at)
    values (
      p_rate_key,
      1,
      v_now + make_interval(secs => p_window_ms / 1000.0)
    )
    on conflict (rate_key) do update
      set attempt_count = 1,
          reset_at = excluded.reset_at;
    return true;
  end if;

  if v_count >= p_max_attempts then
    return false;
  end if;

  update public.login_rate_limits
  set attempt_count = attempt_count + 1
  where rate_key = p_rate_key;

  return true;
end;
$$;

revoke all on function public.check_rate_limit(text, bigint, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, bigint, integer) to service_role;

-- ── Billing export: batch + snapshots + clear in one transaction ─────────────
create or replace function public.commit_billing_export(
  p_batch jsonb,
  p_snapshots jsonb,
  p_handoff_ids text[],
  p_cleared_at timestamptz,
  p_cleared_by text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected integer;
  v_cleared integer;
  v_batch_id text;
  snap jsonb;
begin
  if p_batch is null or p_snapshots is null or p_handoff_ids is null then
    raise exception 'commit_billing_export: missing required arguments';
  end if;

  v_batch_id := p_batch->>'id';
  if v_batch_id is null or length(trim(v_batch_id)) = 0 then
    raise exception 'commit_billing_export: batch id required';
  end if;

  v_expected := coalesce(array_length(p_handoff_ids, 1), 0);
  if v_expected = 0 then
    raise exception 'commit_billing_export: no handoff ids';
  end if;

  insert into public.billing_export_batches (
    id, batch_number, export_date, exported_by, record_count, notes, created_at
  )
  values (
    v_batch_id,
    p_batch->>'batch_number',
    (p_batch->>'export_date')::date,
    coalesce(p_batch->>'exported_by', 'System'),
    coalesce((p_batch->>'record_count')::integer, v_expected),
    nullif(p_batch->>'notes', ''),
    coalesce((p_batch->>'created_at')::timestamptz, now())
  );

  for snap in select value from jsonb_array_elements(p_snapshots)
  loop
    insert into public.billing_export_snapshots (
      id, batch_id, handoff_id, snapshot_json, created_at
    )
    values (
      snap->>'id',
      coalesce(snap->>'batch_id', v_batch_id),
      snap->>'handoff_id',
      snap->>'snapshot_json',
      coalesce((snap->>'created_at')::timestamptz, now())
    );
  end loop;

  update public.billing_handoffs
  set
    cleared_by_accounts_at = p_cleared_at,
    cleared_by = p_cleared_by,
    export_batch_id = v_batch_id,
    notes = coalesce(p_notes, notes),
    updated_at = p_cleared_at
  where id = any (p_handoff_ids)
    and cleared_by_accounts_at is null;

  get diagnostics v_cleared = row_count;

  if v_cleared <> v_expected then
    raise exception
      'commit_billing_export: expected % handoffs cleared, got % (already cleared or missing)',
      v_expected, v_cleared;
  end if;
end;
$$;

revoke all on function public.commit_billing_export(jsonb, jsonb, text[], timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.commit_billing_export(jsonb, jsonb, text[], timestamptz, text, text)
  to service_role;
