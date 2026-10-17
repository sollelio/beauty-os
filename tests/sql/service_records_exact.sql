-- S3b exact-coverage probe — Beauty OS Dev only, synthetic fixtures only (seeds 01, 09, 17, 20).
-- NEVER run against production (Beauty OS Prod) or any project other than Beauty OS Dev (plukxnjnmowlnplpgsnm).
-- Every execution, including on Dev, needs explicit approval from Sollelio. It is not part of `npm run test:db` and
-- must not be added to any automated or scheduled runner.
-- Since S3b no device can read service_records / service_record_payments, so three facts are no longer checked
-- exactly through the API: declared_operator_id, each payment row's amount, and the occurred_at / recorded_at
-- relationship. This probe checks them inside the database, through the real commands:
--   · a synthetic anonymous session enrols with public.redeem_enrollment and captures with public.record_service
--     (device, organization and command checks exactly as for a phone); public.verify_person and
--     public.catalogue_update_service for the catalogue case;
--   · the assertions then read the tables directly, as the owner.
-- Rollback, whatever the server's transaction handling: the file is ONE statement (a DO block). Every write happens in
-- an inner block that always ends in an exception, so its savepoint is rolled back — 'probe_ok' on success (caught),
-- the failed check otherwise (re-raised: the statement fails). The synthetic auth user and session, devices, enrolment
-- uses, records, payments, journal entries, grants, verification audits, PIN counters, the period's review revision,
-- the price change and the request.jwt settings (set_config local) all disappear. No extension, no sequence, no
-- notification, no external call.
-- Run (Beauty OS Dev only; after `cat supabase/.temp/project-ref` shows the same ref):
--   npx supabase db query --linked --project-ref plukxnjnmowlnplpgsnm -f tests/sql/service_records_exact.sql
-- Success: HTTP 201 with an empty result. Failure: the CLI prints the server error ('probe: …' for a failed check).
do $$
declare
  c_a uuid := '00000000-0000-4000-8000-0000000000a1';          -- Teste Isolamento A (seed 01)
  c_person uuid := '00000000-0000-4000-8000-00000000a201';     -- Pessoa Teste A
  c_operator uuid := '00000000-0000-4000-8000-00000000a202';   -- Confirmador Teste A (an active person of A)
  c_service uuid := '00000000-0000-4000-8000-00000000a301';
  c_cash uuid := '00000000-0000-4000-8000-00000000a101';
  c_transfer uuid := '00000000-0000-4000-8000-00000000a102';
  c_g uuid := '00000000-0000-4000-8000-0000000000f5';          -- Teste Catálogo G (seed 17)
  c_g_manager uuid := '00000000-0000-4000-8000-0000000088a1';  -- catalogue.manage, synthetic PIN 818181
  c_g_service uuid := '00000000-0000-4000-8000-0000000088b1';
  c_g_record uuid := '00000000-0000-4000-8000-0000000088c1';   -- historical record: 4.500 while the price was 5.000
  c_g_cash uuid := '00000000-0000-4000-8000-0000000088a0';
  v_now timestamptz := now();                                  -- the transaction time every command writes as recorded_at
  v_user uuid; v_sess uuid; v_dev uuid; v_cmd uuid; r jsonb; r2 jsonb; v_rec public.service_records; v_pay jsonb;
  v_svc public.services; v_grant jsonb;
begin
  -- Dev-only guard, checked before any write. Every marker below exists only because the Dev seeds were loaded (seeds
  -- never run in production): the two fixture organizations by id and name, both enrolment codes by hash and label, the
  -- seed-17 historical record by its fixed command id, and the S1 test organization (seed 20).
  if (select count(*) from public.organizations o
       where (o.id, o.name) in ((c_a, 'Teste Isolamento A'), (c_g, 'Teste Catálogo G'),
                                ('00000000-0000-4000-8000-0000000000fa', 'Teste Inativo I'))) <> 3
     or (select count(*) from private.enrollment_codes e
          where (e.code_hash, e.organization_id, e.label) in
                ((encode(extensions.digest('TEST-ORG-A-2026', 'sha256'), 'hex'), c_a, 'Test device A'),
                 (encode(extensions.digest('TEST-ORG-G-2026', 'sha256'), 'hex'), c_g, 'Test device G'))) <> 2
     or not exists (select 1 from public.service_records sr
                     where sr.id = c_g_record and sr.organization_id = c_g and sr.command_id = '00000000-0000-4000-8000-0000000088c2') then
    raise exception 'probe: Dev fixtures not found — not the Beauty OS Dev database; nothing was written';
  end if;

  begin
    -- 1. a synthetic anonymous session of Teste A, enrolled through the real command
    v_user := gen_random_uuid(); v_sess := gen_random_uuid();
    insert into auth.users (id, aud, role, is_anonymous) values (v_user, 'authenticated', 'authenticated', true);
    insert into auth.sessions (id, user_id) values (v_sess, v_user);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'session_id', v_sess, 'role', 'authenticated', 'is_anonymous', true)::text, true);
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    perform public.redeem_enrollment('TEST-ORG-A-2026');
    select cd.device_id into v_dev from private.current_device() cd where cd.organization_id = c_a;
    if v_dev is null then raise exception 'probe: the synthetic device is not bound to Teste A'; end if;

    -- 2. undated single payment with a declared operator: exact operator, exact times, exact payment row; replay once
    v_cmd := gen_random_uuid();
    r := public.record_service(p_command_id => v_cmd, p_person_id => c_person, p_service_id => c_service, p_value_minor => 100000,
           p_payments => jsonb_build_array(jsonb_build_object('method_id', c_cash, 'amount_minor', 100000)), p_declared_operator_id => c_operator);
    select * into v_rec from public.service_records where id = (r ->> 'record_id')::uuid;
    if v_rec.declared_operator_id is distinct from c_operator then raise exception 'probe: declared_operator_id = %', v_rec.declared_operator_id; end if;
    if v_rec.occurred_at <> v_now or v_rec.recorded_at <> v_now or (r ->> 'occurred_at')::timestamptz <> v_rec.occurred_at then
      raise exception 'probe: undated capture occurred_at % / recorded_at % / response % (expected %)', v_rec.occurred_at, v_rec.recorded_at, r ->> 'occurred_at', v_now; end if;
    if v_rec.organization_id <> c_a or v_rec.device_id <> v_dev or v_rec.payment_kind <> 'single' or v_rec.value_minor <> 100000 then
      raise exception 'probe: single record %', to_jsonb(v_rec); end if;
    select jsonb_agg(jsonb_build_object('method', p.payment_method_id, 'amount', p.amount_minor) order by p.payment_method_id) into v_pay
      from public.service_record_payments p where p.service_record_id = v_rec.id;
    if v_pay is distinct from jsonb_build_array(jsonb_build_object('method', c_cash, 'amount', 100000)) then raise exception 'probe: single payment rows %', v_pay; end if;
    r2 := public.record_service(p_command_id => v_cmd, p_person_id => c_person, p_service_id => c_service, p_value_minor => 100000,
            p_payments => jsonb_build_array(jsonb_build_object('method_id', c_cash, 'amount_minor', 100000)), p_declared_operator_id => c_operator);
    if r2 ->> 'record_id' <> r ->> 'record_id' or (r2 ->> 'replayed')::boolean is not true
       or (select count(*) from public.service_records where command_id = v_cmd) <> 1 then raise exception 'probe: replay %', r2; end if;

    -- 3. mixed payment: exactly two rows with their own amounts; no declared operator → null
    r := public.record_service(p_command_id => gen_random_uuid(), p_person_id => c_person, p_service_id => c_service, p_value_minor => 100000,
           p_payments => jsonb_build_array(jsonb_build_object('method_id', c_cash, 'amount_minor', 60000), jsonb_build_object('method_id', c_transfer, 'amount_minor', 40000)));
    select * into v_rec from public.service_records where id = (r ->> 'record_id')::uuid;
    if v_rec.payment_kind <> 'mixed' or v_rec.declared_operator_id is not null or v_rec.value_minor <> 100000 then raise exception 'probe: mixed record %', to_jsonb(v_rec); end if;
    select jsonb_agg(jsonb_build_object('method', p.payment_method_id, 'amount', p.amount_minor) order by p.payment_method_id) into v_pay
      from public.service_record_payments p where p.service_record_id = v_rec.id;
    if v_pay is distinct from jsonb_build_array(jsonb_build_object('method', c_cash, 'amount', 60000), jsonb_build_object('method', c_transfer, 'amount', 40000)) then
      raise exception 'probe: mixed payment rows %', v_pay; end if;

    -- 4. delayed capture: occurred_at exactly as captured, recorded_at the server write time
    r := public.record_service(p_command_id => gen_random_uuid(), p_person_id => c_person, p_service_id => c_service, p_value_minor => 100000,
           p_payments => jsonb_build_array(jsonb_build_object('method_id', c_cash, 'amount_minor', 100000)), p_occurred_at => v_now - interval '3 hours');
    select * into v_rec from public.service_records where id = (r ->> 'record_id')::uuid;
    if v_rec.occurred_at <> v_now - interval '3 hours' or v_rec.recorded_at <> v_now or (r ->> 'occurred_at')::timestamptz <> v_rec.occurred_at then
      raise exception 'probe: delayed capture occurred_at % / recorded_at %', v_rec.occurred_at, v_rec.recorded_at; end if;

    -- 5. Teste Catálogo G: a price change through Gestão leaves the historical record and its payment row as recorded
    v_user := gen_random_uuid(); v_sess := gen_random_uuid();
    insert into auth.users (id, aud, role, is_anonymous) values (v_user, 'authenticated', 'authenticated', true);
    insert into auth.sessions (id, user_id) values (v_sess, v_user);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'session_id', v_sess, 'role', 'authenticated', 'is_anonymous', true)::text, true);
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    perform public.redeem_enrollment('TEST-ORG-G-2026');
    v_grant := public.verify_person(c_g_manager, '818181');
    if (v_grant ->> 'ok')::boolean is not true then raise exception 'probe: catalogue manager verification %', v_grant; end if;
    select * into v_svc from public.services where id = c_g_service and organization_id = c_g;
    perform public.catalogue_update_service(gen_random_uuid(), (v_grant ->> 'grant_id')::uuid, c_g_service, v_svc.name, v_svc.default_price_minor + 100, v_svc.active);
    if (select default_price_minor from public.services where id = c_g_service) <> v_svc.default_price_minor + 100 then raise exception 'probe: price not changed'; end if;
    select * into v_rec from public.service_records where id = c_g_record;
    if v_rec.value_minor <> 450000 or v_rec.service_id <> c_g_service then raise exception 'probe: historical record %', to_jsonb(v_rec); end if;
    select jsonb_agg(jsonb_build_object('method', p.payment_method_id, 'amount', p.amount_minor)) into v_pay
      from public.service_record_payments p where p.service_record_id = c_g_record;
    if v_pay is distinct from jsonb_build_array(jsonb_build_object('method', c_g_cash, 'amount', 450000)) then raise exception 'probe: historical payment rows %', v_pay; end if;

    raise exception 'probe_ok';
  exception when others then
    if sqlerrm <> 'probe_ok' then raise; end if;
  end;
  raise notice 'service_records_exact: all checks passed; everything rolled back';
end $$;
