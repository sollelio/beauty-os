-- Offline 1 (ADR-0010 §2): capture-time readiness for the four operational capture commands, and distinct
-- inactive-reference codes.
--  · p_occurred_at (optional, last parameter): the business-event time captured on the device. occurred_at =
--    coalesce(p_occurred_at, now()); recorded_at stays the server write time (authoritative for audit).
--  · Bounds against the server clock: at most 48 hours old, at most 5 minutes ahead (both inclusive). Outside them the
--    command is rejected (CAPTURE_TIME_TOO_OLD / CAPTURE_TIME_IN_FUTURE) — server time is never substituted.
--  · The period stays derived from occurred_at by touch_period_of_event: an approved or closed period rejects the
--    record (PERIOD_APPROVED / PERIOD_CLOSED); it is never moved to another period.
--  · p_occurred_at is part of the fingerprint, only when given: callers that omit it keep exactly today's fingerprint
--    (journal entries written before this migration still replay). The journal check stays first, so a replay of a
--    committed command is answered before any bound, reference or grant check (ADR-0006, ADR-0009 mitigation 10).
--  · References: a reference outside the device's organization still answers CROSS_TENANT_REFERENCE (checked first, no
--    existence oracle across organizations); a same-organization reference that is inactive now answers a specific code
--    (PERSON_INACTIVE, SERVICE_INACTIVE, PAYMENT_METHOD_INACTIVE, CATEGORY_INACTIVE, ORIGIN_INACTIVE; products keep the
--    canonical CATALOGUE_INACTIVE), before the one-shot grant is consumed.
--  · The movement.confirm grant is unchanged: checked and consumed at submission; capture time is not grant time.
-- The four functions are replaced (drop + create): a second, defaulted overload would make PostgREST calls ambiguous.

create or replace function private.capture_time(p_occurred_at timestamptz)
returns timestamptz language plpgsql stable security definer set search_path = '' as $$
begin
  if p_occurred_at is null then return now(); end if;
  if p_occurred_at > now() + interval '5 minutes' then raise exception 'CAPTURE_TIME_IN_FUTURE'; end if;
  if p_occurred_at < now() - interval '48 hours' then raise exception 'CAPTURE_TIME_TOO_OLD'; end if;
  return p_occurred_at;
end $$;
revoke all on function private.capture_time(timestamptz) from public, anon, authenticated;

-- The fingerprint addition for a given capture time (empty when omitted, so existing fingerprints are unchanged);
-- microseconds since the epoch, independent of the session's time zone and of the input's text form.
create or replace function private.capture_time_fp(p_occurred_at timestamptz)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when p_occurred_at is null then '{}'::jsonb
              else jsonb_build_object('occurred', (floor(extract(epoch from p_occurred_at) * 1000000))::bigint::text) end
$$;
revoke all on function private.capture_time_fp(timestamptz) from public, anon, authenticated;

-- ---------- record_service ----------
drop function public.record_service(uuid, uuid, uuid, bigint, jsonb, uuid);
create function public.record_service(
  p_command_id uuid,
  p_person_id uuid,
  p_service_id uuid,
  p_value_minor bigint,
  p_payments jsonb,
  p_declared_operator_id uuid default null,
  p_occurred_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_device uuid; v_org uuid; v_uid uuid := auth.uid();
  v_parts jsonb; v_count int; v_sum bigint; v_fp text;
  v_journal private.command_journal; v_record uuid; v_now timestamptz := now(); v_at timestamptz; v_result jsonb;
begin
  select cd.device_id, cd.organization_id into v_device, v_org from private.current_device() cd;
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or p_person_id is null or p_service_id is null or p_value_minor is null
     or p_payments is null or jsonb_typeof(p_payments) <> 'array' then
    raise exception 'VALIDATION_FAILED';
  end if;

  select jsonb_agg(jsonb_build_object('method_id', (e ->> 'method_id')::uuid, 'amount_minor', (e ->> 'amount_minor')::bigint)
                   order by e ->> 'method_id'),
         count(*), sum((e ->> 'amount_minor')::bigint)
    into v_parts, v_count, v_sum
    from jsonb_array_elements(p_payments) e;

  v_fp := md5((jsonb_build_object('type', 'record_service', 'person', p_person_id, 'service', p_service_id,
                                  'value', p_value_minor, 'payments', v_parts, 'declared', p_declared_operator_id)
               || private.capture_time_fp(p_occurred_at))::text);

  -- idempotency: serialise per command_id, then replay or reject
  perform pg_advisory_xact_lock(hashtextextended('cmd:' || p_command_id::text, 0));
  select * into v_journal from private.command_journal where command_id = p_command_id;
  if found then
    if v_journal.organization_id = v_org and v_journal.principal = v_uid
       and v_journal.command_type = 'record_service' and v_journal.fingerprint = v_fp then
      return v_journal.result || jsonb_build_object('replayed', true);
    end if;
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;

  v_at := private.capture_time(p_occurred_at);

  -- every referenced id must belong to the device's organization (no oracle across organizations) …
  if not exists (select 1 from public.people p where p.id = p_person_id and p.organization_id = v_org)
     or not exists (select 1 from public.services s where s.id = p_service_id and s.organization_id = v_org)
     or (p_declared_operator_id is not null
         and not exists (select 1 from public.people p where p.id = p_declared_operator_id and p.organization_id = v_org))
     or exists (select 1 from jsonb_array_elements(v_parts) e
                 where not exists (select 1 from public.payment_methods m
                                    where m.id = (e ->> 'method_id')::uuid and m.organization_id = v_org)) then
    raise exception 'CROSS_TENANT_REFERENCE';
  end if;
  -- … and be active
  if not exists (select 1 from public.people p where p.id = p_person_id and p.active)
     or (p_declared_operator_id is not null and not exists (select 1 from public.people p where p.id = p_declared_operator_id and p.active)) then
    raise exception 'PERSON_INACTIVE';
  end if;
  if not exists (select 1 from public.services s where s.id = p_service_id and s.active) then raise exception 'SERVICE_INACTIVE'; end if;
  if exists (select 1 from jsonb_array_elements(v_parts) e
              where not exists (select 1 from public.payment_methods m where m.id = (e ->> 'method_id')::uuid and m.active)) then
    raise exception 'PAYMENT_METHOD_INACTIVE';
  end if;

  if p_value_minor < 0 or v_count not in (1, 2)
     or exists (select 1 from jsonb_array_elements(v_parts) e where (e ->> 'amount_minor')::bigint is null or (e ->> 'amount_minor')::bigint < 0)
     or (v_count = 2 and (select count(distinct e ->> 'method_id') from jsonb_array_elements(v_parts) e) <> 2)
     or (v_count = 2 and exists (select 1 from jsonb_array_elements(v_parts) e where (e ->> 'amount_minor')::bigint = 0)) then
    raise exception 'VALIDATION_FAILED';
  end if;
  if v_sum <> p_value_minor then raise exception 'MIXED_PAYMENT_MISMATCH'; end if;

  insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind,
                                      occurred_at, recorded_at, device_id, declared_operator_id, command_id)
  values (v_org, p_person_id, p_service_id, p_value_minor, case when v_count = 2 then 'mixed' else 'single' end,
          v_at, v_now, v_device, p_declared_operator_id, p_command_id)
  returning id into v_record;

  insert into public.service_record_payments (service_record_id, organization_id, payment_method_id, amount_minor)
  select v_record, v_org, (e ->> 'method_id')::uuid, (e ->> 'amount_minor')::bigint from jsonb_array_elements(v_parts) e;

  v_result := jsonb_build_object('record_id', v_record, 'occurred_at', v_at);
  insert into private.command_journal (command_id, organization_id, principal, command_type, fingerprint, result)
  values (p_command_id, v_org, v_uid, 'record_service', v_fp, v_result);
  return v_result;
end $$;
revoke all on function public.record_service(uuid, uuid, uuid, bigint, jsonb, uuid, timestamptz) from public, anon;
grant execute on function public.record_service(uuid, uuid, uuid, bigint, jsonb, uuid, timestamptz) to authenticated;

-- ---------- record_advance ----------
drop function public.record_advance(uuid, uuid, uuid, bigint, uuid, text, uuid);
create function public.record_advance(
  p_command_id uuid,
  p_grant_id uuid,
  p_person_id uuid,
  p_amount_minor bigint,
  p_payment_method_id uuid,
  p_note text default null,
  p_declared_operator_id uuid default null,
  p_occurred_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_device uuid; v_org uuid; v_uid uuid := auth.uid(); v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_fp text; v_journal private.command_journal; v_confirmer uuid; v_id uuid; v_now timestamptz := now(); v_at timestamptz; v_result jsonb;
begin
  select cd.device_id, cd.organization_id into v_device, v_org from private.current_device() cd;
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or p_person_id is null or p_amount_minor is null or p_payment_method_id is null then
    raise exception 'VALIDATION_FAILED';
  end if;

  v_fp := md5((jsonb_build_object('type', 'record_advance', 'person', p_person_id, 'amount', p_amount_minor,
                                  'method', p_payment_method_id, 'note', v_note, 'declared', p_declared_operator_id)
               || private.capture_time_fp(p_occurred_at))::text);

  -- idempotency first: a replay returns the original outcome without needing a fresh verification (ADR-0009 mitigation 10)
  perform pg_advisory_xact_lock(hashtextextended('cmd:' || p_command_id::text, 0));
  select * into v_journal from private.command_journal where command_id = p_command_id;
  if found then
    if v_journal.organization_id = v_org and v_journal.principal = v_uid
       and v_journal.command_type = 'record_advance' and v_journal.fingerprint = v_fp then
      return v_journal.result || jsonb_build_object('replayed', true);
    end if;
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;

  v_at := private.capture_time(p_occurred_at);

  if not exists (select 1 from public.people p where p.id = p_person_id and p.organization_id = v_org)
     or not exists (select 1 from public.payment_methods m where m.id = p_payment_method_id and m.organization_id = v_org)
     or (p_declared_operator_id is not null
         and not exists (select 1 from public.people p where p.id = p_declared_operator_id and p.organization_id = v_org)) then
    raise exception 'CROSS_TENANT_REFERENCE';
  end if;
  if not exists (select 1 from public.people p where p.id = p_person_id and p.active)
     or (p_declared_operator_id is not null and not exists (select 1 from public.people p where p.id = p_declared_operator_id and p.active)) then
    raise exception 'PERSON_INACTIVE';
  end if;
  if not exists (select 1 from public.payment_methods m where m.id = p_payment_method_id and m.active) then raise exception 'PAYMENT_METHOD_INACTIVE'; end if;
  if p_amount_minor <= 0 or char_length(coalesce(v_note, '')) > 60 then raise exception 'VALIDATION_FAILED'; end if;

  -- sensitive action: exactly the grant this client obtained, held by a person with the confirm permission (B2)
  v_confirmer := private.consume_one_shot_grant(p_grant_id, 'movement.confirm', p_command_id);

  insert into public.advances (organization_id, person_id, amount_minor, payment_method_id, note, occurred_at, recorded_at,
                               device_id, declared_operator_id, confirmed_by_person_id, command_id)
  values (v_org, p_person_id, p_amount_minor, p_payment_method_id, v_note, v_at, v_now,
          v_device, p_declared_operator_id, v_confirmer, p_command_id)
  returning id into v_id;

  v_result := jsonb_build_object('advance_id', v_id, 'occurred_at', v_at, 'confirmed_by_person_id', v_confirmer);
  insert into private.command_journal (command_id, organization_id, principal, command_type, fingerprint, result)
  values (p_command_id, v_org, v_uid, 'record_advance', v_fp, v_result);
  return v_result;
end $$;
revoke all on function public.record_advance(uuid, uuid, uuid, bigint, uuid, text, uuid, timestamptz) from public, anon;
grant execute on function public.record_advance(uuid, uuid, uuid, bigint, uuid, text, uuid, timestamptz) to authenticated;

-- ---------- record_expense ----------
drop function public.record_expense(uuid, uuid, uuid, bigint, jsonb, text, uuid);
create function public.record_expense(
  p_command_id uuid,
  p_grant_id uuid,
  p_category_id uuid,
  p_amount_minor bigint,
  p_payments jsonb,
  p_note text default null,
  p_declared_operator_id uuid default null,
  p_occurred_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_device uuid; v_org uuid; v_uid uuid := auth.uid(); v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_parts jsonb; v_count int; v_sum bigint; v_fp text; v_journal private.command_journal;
  v_confirmer uuid; v_id uuid; v_now timestamptz := now(); v_at timestamptz; v_result jsonb;
begin
  select cd.device_id, cd.organization_id into v_device, v_org from private.current_device() cd;
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or p_category_id is null or p_amount_minor is null
     or p_payments is null or jsonb_typeof(p_payments) <> 'array' then
    raise exception 'VALIDATION_FAILED';
  end if;

  select jsonb_agg(jsonb_build_object('method_id', (e ->> 'method_id')::uuid, 'amount_minor', (e ->> 'amount_minor')::bigint)
                   order by e ->> 'method_id'),
         count(*), sum((e ->> 'amount_minor')::bigint)
    into v_parts, v_count, v_sum
    from jsonb_array_elements(p_payments) e;

  v_fp := md5((jsonb_build_object('type', 'record_expense', 'category', p_category_id, 'amount', p_amount_minor,
                                  'payments', v_parts, 'note', v_note, 'declared', p_declared_operator_id)
               || private.capture_time_fp(p_occurred_at))::text);

  perform pg_advisory_xact_lock(hashtextextended('cmd:' || p_command_id::text, 0));
  select * into v_journal from private.command_journal where command_id = p_command_id;
  if found then
    if v_journal.organization_id = v_org and v_journal.principal = v_uid
       and v_journal.command_type = 'record_expense' and v_journal.fingerprint = v_fp then
      return v_journal.result || jsonb_build_object('replayed', true);
    end if;
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;

  v_at := private.capture_time(p_occurred_at);

  if not exists (select 1 from public.expense_categories c where c.id = p_category_id and c.organization_id = v_org)
     or (p_declared_operator_id is not null
         and not exists (select 1 from public.people p where p.id = p_declared_operator_id and p.organization_id = v_org))
     or exists (select 1 from jsonb_array_elements(v_parts) e
                 where not exists (select 1 from public.payment_methods m
                                    where m.id = (e ->> 'method_id')::uuid and m.organization_id = v_org)) then
    raise exception 'CROSS_TENANT_REFERENCE';
  end if;
  if not exists (select 1 from public.expense_categories c where c.id = p_category_id and c.active) then raise exception 'CATEGORY_INACTIVE'; end if;
  if p_declared_operator_id is not null and not exists (select 1 from public.people p where p.id = p_declared_operator_id and p.active) then
    raise exception 'PERSON_INACTIVE';
  end if;
  if exists (select 1 from jsonb_array_elements(v_parts) e
              where not exists (select 1 from public.payment_methods m where m.id = (e ->> 'method_id')::uuid and m.active)) then
    raise exception 'PAYMENT_METHOD_INACTIVE';
  end if;

  if p_amount_minor <= 0 or v_count not in (1, 2) or char_length(coalesce(v_note, '')) > 60
     or exists (select 1 from jsonb_array_elements(v_parts) e where (e ->> 'amount_minor')::bigint is null or (e ->> 'amount_minor')::bigint <= 0)
     or (v_count = 2 and (select count(distinct e ->> 'method_id') from jsonb_array_elements(v_parts) e) <> 2) then
    raise exception 'VALIDATION_FAILED';
  end if;
  if v_sum <> p_amount_minor then raise exception 'MIXED_PAYMENT_MISMATCH'; end if;

  v_confirmer := private.consume_one_shot_grant(p_grant_id, 'movement.confirm', p_command_id);

  insert into public.expenses (organization_id, category_id, amount_minor, payment_kind, note, occurred_at, recorded_at,
                               device_id, declared_operator_id, confirmed_by_person_id, command_id)
  values (v_org, p_category_id, p_amount_minor, case when v_count = 2 then 'mixed' else 'single' end, v_note, v_at, v_now,
          v_device, p_declared_operator_id, v_confirmer, p_command_id)
  returning id into v_id;

  insert into public.expense_payments (expense_id, organization_id, payment_method_id, amount_minor)
  select v_id, v_org, (e ->> 'method_id')::uuid, (e ->> 'amount_minor')::bigint from jsonb_array_elements(v_parts) e;

  v_result := jsonb_build_object('expense_id', v_id, 'occurred_at', v_at, 'confirmed_by_person_id', v_confirmer);
  insert into private.command_journal (command_id, organization_id, principal, command_type, fingerprint, result)
  values (p_command_id, v_org, v_uid, 'record_expense', v_fp, v_result);
  return v_result;
end $$;
revoke all on function public.record_expense(uuid, uuid, uuid, bigint, jsonb, text, uuid, timestamptz) from public, anon;
grant execute on function public.record_expense(uuid, uuid, uuid, bigint, jsonb, text, uuid, timestamptz) to authenticated;

-- ---------- record_purchase ----------
drop function public.record_purchase(uuid, uuid, jsonb, bigint, jsonb, uuid, uuid);
create function public.record_purchase(
  p_command_id uuid,
  p_grant_id uuid,
  p_lines jsonb,
  p_salon_amount_minor bigint,
  p_contributions jsonb,
  p_origin_id uuid default null,
  p_declared_operator_id uuid default null,
  p_occurred_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_device uuid; v_org uuid; v_uid uuid := auth.uid(); v_now timestamptz := now(); v_at timestamptz;
  v_lines jsonb; v_contribs jsonb; v_total bigint; v_contrib_sum bigint; v_fp text; v_journal private.command_journal;
  v_confirmer uuid; v_purchase uuid; v_result jsonb; v_line jsonb; v_product uuid; v_unit text; v_pos int := 0; v_new int := 0;
begin
  select cd.device_id, cd.organization_id into v_device, v_org from private.current_device() cd;
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or p_lines is null or jsonb_typeof(p_lines) <> 'array' or p_salon_amount_minor is null
     or p_contributions is null or jsonb_typeof(p_contributions) <> 'array' then
    raise exception 'VALIDATION_FAILED';
  end if;

  -- canonical form for the fingerprint: lines keyed by product id or normalized new-product name, sorted
  select jsonb_agg(x.line order by x.k), sum((x.line ->> 'line_cost_minor')::bigint)
    into v_lines, v_total
    from (
      select case when e ? 'product_id' then 'p:' || (e ->> 'product_id')
                  else 'n:' || lower(trim(e -> 'new_product' ->> 'name')) end as k,
             jsonb_build_object(
               'product_id', (e ->> 'product_id')::uuid,
               'new_name', nullif(trim(e -> 'new_product' ->> 'name'), ''),
               'new_unit', e -> 'new_product' ->> 'unit_word',
               'quantity', (e ->> 'quantity')::int,
               'line_cost_minor', (e ->> 'line_cost_minor')::bigint) as line
        from jsonb_array_elements(p_lines) e
    ) x;
  select coalesce(jsonb_agg(jsonb_build_object('person_id', (e ->> 'person_id')::uuid, 'amount_minor', (e ->> 'amount_minor')::bigint)
                            order by e ->> 'person_id'), '[]'::jsonb),
         coalesce(sum((e ->> 'amount_minor')::bigint), 0)
    into v_contribs, v_contrib_sum
    from jsonb_array_elements(p_contributions) e;

  v_fp := md5((jsonb_build_object('type', 'record_purchase', 'lines', v_lines, 'salon', p_salon_amount_minor,
                                  'contributions', v_contribs, 'origin', p_origin_id, 'declared', p_declared_operator_id)
               || private.capture_time_fp(p_occurred_at))::text);

  perform pg_advisory_xact_lock(hashtextextended('cmd:' || p_command_id::text, 0));
  select * into v_journal from private.command_journal where command_id = p_command_id;
  if found then
    if v_journal.organization_id = v_org and v_journal.principal = v_uid
       and v_journal.command_type = 'record_purchase' and v_journal.fingerprint = v_fp then
      return v_journal.result || jsonb_build_object('replayed', true);
    end if;
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;

  v_at := private.capture_time(p_occurred_at);

  -- references must belong to the device's organization …
  if exists (select 1 from jsonb_array_elements(v_lines) l
              where l ->> 'product_id' is not null
                and not exists (select 1 from public.products p where p.id = (l ->> 'product_id')::uuid and p.organization_id = v_org))
     or exists (select 1 from jsonb_array_elements(v_contribs) c
                 where not exists (select 1 from public.people p where p.id = (c ->> 'person_id')::uuid and p.organization_id = v_org))
     or (p_origin_id is not null
         and not exists (select 1 from public.purchase_origins o where o.id = p_origin_id and o.organization_id = v_org))
     or (p_declared_operator_id is not null
         and not exists (select 1 from public.people p where p.id = p_declared_operator_id and p.organization_id = v_org)) then
    raise exception 'CROSS_TENANT_REFERENCE';
  end if;
  -- … and be active (an inactive product, or a new-product name that matches one, is the canonical CATALOGUE_INACTIVE)
  if exists (select 1 from jsonb_array_elements(v_lines) l
              where (l ->> 'product_id' is not null
                     and not exists (select 1 from public.products p where p.id = (l ->> 'product_id')::uuid and p.active))
                 or (l ->> 'product_id' is null
                     and exists (select 1 from public.products p
                                  where p.organization_id = v_org and lower(trim(p.name)) = lower(trim(l ->> 'new_name')) and not p.active))) then
    raise exception 'CATALOGUE_INACTIVE';
  end if;
  if exists (select 1 from jsonb_array_elements(v_contribs) c
              where not exists (select 1 from public.people p where p.id = (c ->> 'person_id')::uuid and p.active))
     or (p_declared_operator_id is not null and not exists (select 1 from public.people p where p.id = p_declared_operator_id and p.active)) then
    raise exception 'PERSON_INACTIVE';
  end if;
  if p_origin_id is not null and not exists (select 1 from public.purchase_origins o where o.id = p_origin_id and o.active) then
    raise exception 'ORIGIN_INACTIVE';
  end if;

  -- shape
  if jsonb_array_length(v_lines) < 1 or jsonb_array_length(v_lines) > 100 or v_total is null or v_total <= 0 or p_salon_amount_minor < 0
     or exists (select 1 from jsonb_array_elements(v_lines) l
                 where (l ->> 'quantity') is null or (l ->> 'quantity')::int not between 1 and 9999
                    or (l ->> 'line_cost_minor') is null or (l ->> 'line_cost_minor')::bigint < 0
                    or ((l ->> 'product_id') is null and (
                          (l ->> 'new_name') is null or char_length(l ->> 'new_name') not between 2 and 80
                          or not exists (select 1 from public.unit_words w where w.organization_id = v_org and w.word = l ->> 'new_unit'))))
     or (select count(*) from jsonb_array_elements(v_lines)) <>
        (select count(distinct coalesce(l ->> 'product_id', 'n:' || lower(l ->> 'new_name'))) from jsonb_array_elements(v_lines) l)
     or exists (select 1 from jsonb_array_elements(v_contribs) c where (c ->> 'amount_minor') is null or (c ->> 'amount_minor')::bigint <= 0)
     or (select count(*) from jsonb_array_elements(v_contribs)) <>
        (select count(distinct c ->> 'person_id') from jsonb_array_elements(v_contribs) c) then
    raise exception 'VALIDATION_FAILED';
  end if;
  if p_salon_amount_minor + v_contrib_sum <> v_total then raise exception 'CONTRIBUTIONS_MISMATCH'; end if;

  v_confirmer := private.consume_one_shot_grant(p_grant_id, 'movement.confirm', p_command_id);

  insert into public.purchases (organization_id, total_minor, origin_id, occurred_at, recorded_at, device_id,
                                declared_operator_id, confirmed_by_person_id, command_id)
  values (v_org, v_total, p_origin_id, v_at, v_now, v_device, p_declared_operator_id, v_confirmer, p_command_id)
  returning id into v_purchase;

  for v_line in select l from jsonb_array_elements(p_lines) l loop      -- keep the operator's line order
    v_pos := v_pos + 1;
    if v_line ? 'product_id' then
      select p.id, p.unit_word into v_product, v_unit from public.products p where p.id = (v_line ->> 'product_id')::uuid;
    else
      select p.id, p.unit_word into v_product, v_unit from public.products p
       where p.organization_id = v_org and lower(trim(p.name)) = lower(trim(v_line -> 'new_product' ->> 'name'));
      if v_product is null then
        insert into public.products (organization_id, name, unit_word)
        values (v_org, trim(v_line -> 'new_product' ->> 'name'), v_line -> 'new_product' ->> 'unit_word')
        returning id, unit_word into v_product, v_unit;
        v_new := v_new + 1;
      end if;
    end if;
    insert into public.purchase_lines (purchase_id, organization_id, product_id, quantity, unit_word, line_cost_minor, position)
    values (v_purchase, v_org, v_product, (v_line ->> 'quantity')::int, v_unit, (v_line ->> 'line_cost_minor')::bigint, v_pos);
  end loop;

  if p_salon_amount_minor > 0 then
    insert into public.purchase_contributions (purchase_id, organization_id, contributor_kind, person_id, amount_minor)
    values (v_purchase, v_org, 'salon', null, p_salon_amount_minor);
  end if;
  insert into public.purchase_contributions (purchase_id, organization_id, contributor_kind, person_id, amount_minor)
  select v_purchase, v_org, 'person', (c ->> 'person_id')::uuid, (c ->> 'amount_minor')::bigint from jsonb_array_elements(v_contribs) c;

  v_result := jsonb_build_object(
    'purchase_id', v_purchase, 'occurred_at', v_at, 'total_minor', v_total,
    'line_count', jsonb_array_length(v_lines), 'new_product_count', v_new,
    'salon_amount_minor', p_salon_amount_minor,
    'contributors', (select coalesce(jsonb_agg(jsonb_build_object('person_id', c.person_id, 'display_name', pe.display_name, 'amount_minor', c.amount_minor)
                                               order by pe.display_name), '[]'::jsonb)
                       from public.purchase_contributions c join public.people pe on pe.id = c.person_id
                      where c.purchase_id = v_purchase),
    'confirmed_by_person_id', v_confirmer);
  insert into private.command_journal (command_id, organization_id, principal, command_type, fingerprint, result)
  values (p_command_id, v_org, v_uid, 'record_purchase', v_fp, v_result);
  return v_result;
end $$;
revoke all on function public.record_purchase(uuid, uuid, jsonb, bigint, jsonb, uuid, uuid, timestamptz) from public, anon;
grant execute on function public.record_purchase(uuid, uuid, jsonb, bigint, jsonb, uuid, uuid, timestamptz) to authenticated;
