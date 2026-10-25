-- Device purpose probe (ADR-0010 §5 amendment, Slice 1) — Beauty OS Dev only, synthetic fixtures only (seeds 01, 02).
-- NEVER run against production (Beauty OS Prod) or any project other than Beauty OS Dev (plukxnjnmowlnplpgsnm).
-- Every execution, including on Dev, needs explicit approval from Sollelio. It is not part of `npm run test:db` and
-- must not be added to any automated or scheduled runner.
-- A support device is made only by the operator procedure, which no browser role can execute, so its paths are checked
-- here, inside the database, through the real commands: a synthetic anonymous session enrols with
-- public.redeem_enrollment; the operator procedure runs as the owner; the device then calls device_context,
-- report_device_sync, record_service, verify_person and record_advance exactly as a phone would. Checked:
--   · a new device is operational: dated (offline) captures are accepted as before, and it registers offline-capable;
--   · the purpose cannot become support while the device reports work (DEVICE_HAS_OFFLINE_WORK);
--   · as support: audited, offline capability cleared, outside the guard and its per-device detail, device_context says
--     so, its sync reports are answered and ignored, it captures online (server time) and every dated capture is refused
--     (DEVICE_ONLINE_ONLY) — for a movement without consuming the one-shot grant; a replay of a command it committed
--     before is still answered (exactly-once first);
--   · browser roles cannot execute the procedure; back to operational is audited and the next report registers again.
-- Rollback, whatever the server's transaction handling: ONE statement (a DO block); every write happens in an inner block
-- that always ends in an exception, so its savepoint is rolled back — 'probe_ok' on success (caught), the failed check
-- otherwise (re-raised: the statement fails). The synthetic auth user and session, the device, enrolment use, records,
-- journal entries, grants, verification audits, the probe period, reports, audit rows and the request.jwt settings all
-- disappear.
-- Run (Beauty OS Dev only; after `cat supabase/.temp/project-ref` shows the same ref):
--   npx supabase db query --linked -f tests/sql/device_purpose_probe.sql
-- Success: an empty result. Failure: the CLI prints the server error ('probe: …' for a failed check).
do $$
declare
  c_a uuid := '00000000-0000-4000-8000-0000000000a1';          -- Teste Isolamento A (seed 01)
  c_person uuid := '00000000-0000-4000-8000-00000000a201';     -- Pessoa Teste A
  c_confirmer uuid := '00000000-0000-4000-8000-00000000a202';  -- Confirmador Teste A: movement.confirm, synthetic PIN 222222 (seed 02)
  c_service uuid := '00000000-0000-4000-8000-00000000a301';
  c_cash uuid := '00000000-0000-4000-8000-00000000a101';
  v_now timestamptz := now();
  v_at timestamptz := now() - interval '1 hour';
  v_user uuid; v_sess uuid; v_dev uuid; v_cmd uuid; r jsonb; r2 jsonb; v_g0 jsonb; v_g1 jsonb; v_p public.periods; v_grant jsonb;
  v_reported timestamptz;
  pay jsonb := jsonb_build_array(jsonb_build_object('method_id', c_cash, 'amount_minor', 100000));
begin
  -- Dev-only guard, checked before any write: the seed-01 organization by id and name, its enrolment code by hash and
  -- label, and the seed-02 confirmer (seeds never run in production).
  if not exists (select 1 from public.organizations where id = c_a and name = 'Teste Isolamento A')
     or not exists (select 1 from private.enrollment_codes where code_hash = encode(extensions.digest('TEST-ORG-A-2026', 'sha256'), 'hex')
                     and organization_id = c_a and label = 'Test device A')
     or not exists (select 1 from public.people where id = c_confirmer and organization_id = c_a and display_name = 'Confirmador Teste A') then
    raise exception 'probe: Dev fixtures not found — not the Beauty OS Dev database; nothing was written';
  end if;

  begin
    -- a synthetic anonymous session of Teste A, enrolled through the real command
    v_user := gen_random_uuid(); v_sess := gen_random_uuid();
    insert into auth.users (id, aud, role, is_anonymous) values (v_user, 'authenticated', 'authenticated', true);
    insert into auth.sessions (id, user_id) values (v_sess, v_user);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'session_id', v_sess, 'role', 'authenticated', 'is_anonymous', true)::text, true);
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    perform public.redeem_enrollment('TEST-ORG-A-2026');
    select cd.device_id into v_dev from private.current_device() cd where cd.organization_id = c_a;
    if v_dev is null then raise exception 'probe: the synthetic device is not bound to Teste A'; end if;

    -- 1. a new device is operational, as every existing one: a dated capture is accepted, a report registers it
    if public.device_context() -> 'device' ->> 'purpose' is distinct from 'operational' then raise exception 'probe: context %', public.device_context(); end if;
    v_cmd := gen_random_uuid();
    r := public.record_service(p_command_id => v_cmd, p_person_id => c_person, p_service_id => c_service, p_value_minor => 100000,
           p_payments => pay, p_occurred_at => v_at);
    if (r ->> 'occurred_at')::timestamptz <> v_at then raise exception 'probe: operational dated capture %', r; end if;
    perform public.report_device_sync('{"days": [], "undated": {}}'::jsonb);
    if (select offline_capable_at from private.devices where id = v_dev) is null then raise exception 'probe: not registered'; end if;

    -- a past period of Teste A before all of its own, to watch the guard (written as the owner; rolled back with everything else)
    insert into public.periods (organization_id, label, starts_on, ends_on)
      select c_a, 'probe device purpose', d, d + 6 from (select coalesce(min(starts_on), date '2001-01-01') - 30 as d from public.periods where organization_id = c_a) x
      returning * into v_p;
    v_g0 := private.period_device_sync(c_a, v_p);
    if not exists (select 1 from jsonb_array_elements(private.period_device_sync_detail(c_a, v_p)) x where (x ->> 'this_device')::boolean and x ->> 'state' = 'ready') then
      raise exception 'probe: the operational device is not in the detail'; end if;

    -- 2. not while the device reports work
    perform public.report_device_sync('{"days": [], "undated": {"services": 1}}'::jsonb);
    begin
      perform private.admin_set_device_purpose(v_dev, 'support', 'probe');
      raise exception 'probe: support accepted with reported work';
    exception when others then if sqlerrm <> 'DEVICE_HAS_OFFLINE_WORK' then raise; end if;
    end;
    perform public.report_device_sync('{"days": [], "undated": {}}'::jsonb);

    -- 3. support: audited, capability cleared, outside the guard and the detail, said by the device context
    perform private.admin_set_device_purpose(v_dev, 'support', 'probe');
    if (select purpose from private.devices where id = v_dev) <> 'support' or (select offline_capable_at from private.devices where id = v_dev) is not null
       or (select revoked_at from private.devices where id = v_dev) is not null then raise exception 'probe: device after the change'; end if;
    if not exists (select 1 from private.security_audit where action = 'device_purpose_set' and subject = v_dev
                    and detail ->> 'from' = 'operational' and detail ->> 'to' = 'support' and detail ->> 'reason' = 'probe') then raise exception 'probe: audit'; end if;
    v_g1 := private.period_device_sync(c_a, v_p);
    if (v_g1 ->> 'ready')::int <> (v_g0 ->> 'ready')::int - 1 or v_g1 ->> 'pending' <> v_g0 ->> 'pending' or v_g1 ->> 'silent' <> v_g0 ->> 'silent' then
      raise exception 'probe: guard % → %', v_g0, v_g1; end if;
    if exists (select 1 from jsonb_array_elements(private.period_device_sync_detail(c_a, v_p)) x where (x ->> 'this_device')::boolean) then
      raise exception 'probe: support device in the detail'; end if;
    if public.device_context() -> 'device' ->> 'purpose' is distinct from 'support' or (public.device_context() ->> 'bound')::boolean is not true then
      raise exception 'probe: support context %', public.device_context(); end if;

    -- 4. its reports are answered and ignored
    select reported_at into v_reported from private.device_sync_reports where device_id = v_dev;
    r := public.report_device_sync(jsonb_build_object('days', jsonb_build_array(jsonb_build_object('day', (v_p.starts_on + 1)::text, 'services', 3)),
                                                      'undated', jsonb_build_object('drafts', 1)));
    if (r ->> 'offline_capture')::boolean is not false or (select offline_capable_at from private.devices where id = v_dev) is not null
       or (select reported_at from private.device_sync_reports where device_id = v_dev) <> v_reported
       or private.period_device_sync(c_a, v_p) <> v_g1 then raise exception 'probe: support report %', r; end if;

    -- 5. online capture works (the server's time); every dated capture is refused
    r := public.record_service(p_command_id => gen_random_uuid(), p_person_id => c_person, p_service_id => c_service, p_value_minor => 100000, p_payments => pay);
    if (r ->> 'occurred_at')::timestamptz <> v_now then raise exception 'probe: support online capture %', r; end if;
    begin
      perform public.record_service(p_command_id => gen_random_uuid(), p_person_id => c_person, p_service_id => c_service, p_value_minor => 100000,
                p_payments => pay, p_occurred_at => v_now - interval '10 minutes');
      raise exception 'probe: support dated capture accepted';
    exception when others then if sqlerrm <> 'DEVICE_ONLINE_ONLY' then raise; end if;
    end;

    -- 6. exactly-once first: the command it committed while operational still replays
    r2 := public.record_service(p_command_id => v_cmd, p_person_id => c_person, p_service_id => c_service, p_value_minor => 100000,
            p_payments => pay, p_occurred_at => v_at);
    if (r2 ->> 'replayed')::boolean is not true or (select count(*) from public.service_records where command_id = v_cmd) <> 1 then
      raise exception 'probe: replay %', r2; end if;

    -- 7. a movement: the dated one is refused without consuming the one-shot grant; the online one uses it
    v_grant := public.verify_person(c_confirmer, '222222');
    if (v_grant ->> 'ok')::boolean is not true then raise exception 'probe: verification %', v_grant; end if;
    begin
      perform public.record_advance(gen_random_uuid(), (v_grant ->> 'grant_id')::uuid, c_person, 5000, c_cash, null, null, v_now - interval '10 minutes');
      raise exception 'probe: support dated advance accepted';
    exception when others then if sqlerrm <> 'DEVICE_ONLINE_ONLY' then raise; end if;
    end;
    if (select consumed_at from private.verification_grants where id = (v_grant ->> 'grant_id')::uuid) is not null then raise exception 'probe: grant consumed by a refusal'; end if;
    r := public.record_advance(gen_random_uuid(), (v_grant ->> 'grant_id')::uuid, c_person, 5000, c_cash);
    if (select consumed_at from private.verification_grants where id = (v_grant ->> 'grant_id')::uuid) is null then raise exception 'probe: online advance %', r; end if;

    -- 8. browser roles cannot change a purpose
    if has_function_privilege('authenticated', 'private.admin_set_device_purpose(uuid, text, text)', 'execute')
       or has_function_privilege('anon', 'private.admin_set_device_purpose(uuid, text, text)', 'execute') then raise exception 'probe: procedure exposed'; end if;

    -- 9. back to operational: audited; the next report registers it again, and it counts in the guard
    perform private.admin_set_device_purpose(v_dev, 'operational', 'probe back');
    if not exists (select 1 from private.security_audit where action = 'device_purpose_set' and subject = v_dev and detail ->> 'to' = 'operational') then
      raise exception 'probe: audit back'; end if;
    perform public.report_device_sync('{"days": [], "undated": {}}'::jsonb);
    if (select offline_capable_at from private.devices where id = v_dev) is null or private.period_device_sync(c_a, v_p) <> v_g0 then
      raise exception 'probe: operational again %', private.period_device_sync(c_a, v_p); end if;

    raise exception 'probe_ok';
  exception when others then
    if sqlerrm <> 'probe_ok' then raise; end if;
  end;
end $$;
