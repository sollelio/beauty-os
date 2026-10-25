-- Operational week end probe (ADR-0010 §5 amendment, Slice 2) — Beauty OS Dev only.
-- NEVER run against production (Beauty OS Prod) or any project other than Beauty OS Dev (plukxnjnmowlnplpgsnm).
-- Every execution, including on Dev, needs explicit approval from Sollelio. It is not part of `npm run test:db` and
-- must not be added to any automated or scheduled runner.
-- The declaration depends on the organization's schedule and the real date, and a schedule is set only by an operator,
-- so this probe builds a throwaway organization (people, PIN, permissions, catalogue, an enrolment code, a period around
-- today) inside the transaction, with its schedule relative to today in Africa/Luanda, and drives the real commands as a
-- phone would (synthetic anonymous sessions enrolled with public.redeem_enrollment). Checked:
--   · no schedule: WEEK_END_NOT_AVAILABLE; the operational end is the calendar end; Teste Isolamento A is unchanged;
--   · before the last operating day: WEEK_END_TOO_EARLY;
--   · on it before the usual closing time: declared, early = true, append-only event, in the history and the review;
--     a second declaration: PERIOD_WEEK_ENDED;
--   · the freeze: a service or an advance whose time is after the declared end → PERIOD_WEEK_ENDED (the advance without
--     consuming its grant); work from before the end, sent later, is accepted;
--   · withdrawal: recorded, inputs accepted again; re-declaration after the usual closing time: early = false;
--   · the guard: its end is the declaration; a phone whose last report is not after it blocks (approval refused with
--     PERIOD_OFFLINE_SYNC_PENDING); after a later zero report it is ready; a support device is excluded;
--   · after approval: withdrawal refused (PERIOD_STATE_INVALID); after the annulment it is allowed;
--   · browser roles can execute the two commands only as authenticated, never the schedule procedure.
-- Within one transaction now() does not move: "a report after the declaration" is the phone's stored report moved one
-- second later (as the owner), exactly what its next real report would write.
-- Rollback: ONE statement (a DO block); every write happens in an inner block that always ends in an exception, so its
-- savepoint is rolled back — 'probe_ok' on success (caught), the failed check otherwise (re-raised).
-- Run (Beauty OS Dev only; after `cat supabase/.temp/project-ref` shows the same ref):
--   npx supabase db query --linked -f tests/sql/week_end_probe.sql
-- Success: an empty result. Failure: the CLI prints the server error ('probe: …' for a failed check).
do $$
declare
  c_a uuid := '00000000-0000-4000-8000-0000000000a1';          -- Teste Isolamento A (seed 01): an organization without a schedule
  v_org uuid := gen_random_uuid(); v_mgr uuid := gen_random_uuid(); v_pro uuid := gen_random_uuid();
  v_svc uuid := gen_random_uuid(); v_cash uuid := gen_random_uuid(); v_code text := upper('PROBE-WEEK-' || substr(md5(random()::text), 1, 8));
  v_today date := (now() at time zone 'Africa/Luanda')::date; v_dow smallint := extract(isodow from (now() at time zone 'Africa/Luanda'))::smallint;
  v_p public.periods; v_d1 uuid; v_d2 uuid; v_u1 uuid; v_s1 uuid; v_u2 uuid; v_s2 uuid;
  r jsonb; g jsonb; v_rev bigint; v_n int;
  pay jsonb;
begin
  if not exists (select 1 from public.organizations where id = c_a and name = 'Teste Isolamento A') then
    raise exception 'probe: Dev fixtures not found — not the Beauty OS Dev database; nothing was written';
  end if;
  pay := jsonb_build_array(jsonb_build_object('method_id', v_cash, 'amount_minor', 100000));

  begin
    -- a throwaway salon: manager (period.decide, team.finance.read, movement.confirm; synthetic PIN), one professional
    insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values (v_org, 'Probe Semana', 'Africa/Luanda', 'AOA', 2, 'Kz');
    insert into public.people (id, organization_id, display_name) values (v_mgr, v_org, 'Gestor Probe'), (v_pro, v_org, 'Profissional Probe');
    insert into public.person_capabilities (organization_id, person_id, label) values (v_org, v_pro, 'Cabelo');
    insert into private.person_secrets (person_id, organization_id, secret_hash) values (v_mgr, v_org, extensions.crypt('424242', extensions.gen_salt('bf', 4)));
    insert into private.person_permissions (organization_id, person_id, permission) values
      (v_org, v_mgr, 'period.decide'), (v_org, v_mgr, 'team.finance.read'), (v_org, v_mgr, 'movement.confirm');
    insert into public.services (id, organization_id, name, default_price_minor) values (v_svc, v_org, 'Serviço Probe', 100000);
    insert into public.payment_methods (id, organization_id, code, label) values (v_cash, v_org, 'numerario', 'Numerário');
    perform private.admin_set_rule(v_pro, 'standing', 50, v_today - 30, v_mgr);
    insert into private.enrollment_codes (code_hash, organization_id, label, expires_at, max_uses)
      values (encode(extensions.digest(v_code, 'sha256'), 'hex'), v_org, 'Telemóvel probe', now() + interval '1 hour', 5);
    -- a seven-day period around today: today is its only day with today's weekday; it ends tomorrow
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'Probe semana', v_today - 5, v_today + 1) returning * into v_p;

    -- two phones, enrolled through the real command (the second is switched between below)
    v_u1 := gen_random_uuid(); v_s1 := gen_random_uuid(); v_u2 := gen_random_uuid(); v_s2 := gen_random_uuid();
    insert into auth.users (id, aud, role, is_anonymous) values (v_u1, 'authenticated', 'authenticated', true), (v_u2, 'authenticated', 'authenticated', true);
    insert into auth.sessions (id, user_id) values (v_s1, v_u1), (v_s2, v_u2);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_u2, 'session_id', v_s2, 'role', 'authenticated', 'is_anonymous', true)::text, true);
    perform set_config('request.jwt.claim.sub', v_u2::text, true);
    perform public.redeem_enrollment(v_code);
    select cd.device_id into v_d2 from private.current_device() cd;
    perform public.report_device_sync('{"days": [], "undated": {}}'::jsonb);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_u1, 'session_id', v_s1, 'role', 'authenticated', 'is_anonymous', true)::text, true);
    perform set_config('request.jwt.claim.sub', v_u1::text, true);
    perform public.redeem_enrollment(v_code);
    select cd.device_id into v_d1 from private.current_device() cd;
    perform public.report_device_sync('{"days": [], "undated": {}}'::jsonb);
    if v_d1 is null or v_d2 is null then raise exception 'probe: phones not enrolled'; end if;
    if (public.verify_person(v_mgr, '424242', 'private_session') ->> 'ok')::boolean is not true then raise exception 'probe: private context'; end if;

    -- 1. no schedule: not available; the operational end is the calendar end; an unscheduled fixture organization too
    g := public.verify_person(v_mgr, '424242');
    begin perform public.declare_week_end(gen_random_uuid(), (g ->> 'grant_id')::uuid, v_p.id); raise exception 'probe: declared without a schedule';
    exception when others then if sqlerrm <> 'WEEK_END_NOT_AVAILABLE' then raise; end if; end;
    if private.period_operational_end(v_p) <> (v_p.ends_on + 1)::timestamp at time zone 'Africa/Luanda' then raise exception 'probe: unscheduled end'; end if;
    if exists (select 1 from public.periods p where p.organization_id = c_a
                and ((private.period_week_end(p) ->> 'available')::boolean or private.period_operational_end(p) <> (p.ends_on + 1)::timestamp at time zone 'Africa/Luanda')) then
      raise exception 'probe: Teste Isolamento A changed'; end if;

    -- 2. before the last operating day (tomorrow's weekday): too early
    update public.organizations set week_last_operating_day = (v_dow % 7) + 1, usual_closing_time = time '20:00' where id = v_org;
    g := public.verify_person(v_mgr, '424242');
    begin perform public.declare_week_end(gen_random_uuid(), (g ->> 'grant_id')::uuid, v_p.id); raise exception 'probe: declared too early';
    exception when others then if sqlerrm <> 'WEEK_END_TOO_EARLY' then raise; end if; end;
    if (select consumed_at from private.verification_grants where id = (g ->> 'grant_id')::uuid) is not null then raise exception 'probe: refusal consumed the grant'; end if;

    -- 3. today, before the usual closing time: declared early, append-only, in the review and the history; not twice
    update public.organizations set week_last_operating_day = v_dow, usual_closing_time = time '23:59:59' where id = v_org;
    r := public.declare_week_end(gen_random_uuid(), (g ->> 'grant_id')::uuid, v_p.id);
    if (r ->> 'early')::boolean is not true or (r ->> 'declared_at')::timestamptz <> now() then raise exception 'probe: early declaration %', r; end if;
    if (select count(*) from public.period_week_end_events where period_id = v_p.id and kind = 'declared' and early and person_id = v_mgr) <> 1 then raise exception 'probe: event'; end if;
    if public.fecho_period(v_p.id) -> 'week_end' -> 'declared' ->> 'by' <> 'Gestor Probe' or not (public.fecho_period(v_p.id) -> 'week_end' ->> 'can_withdraw')::boolean then
      raise exception 'probe: review %', public.fecho_period(v_p.id) -> 'week_end'; end if;
    if not exists (select 1 from jsonb_array_elements(public.fecho_history(v_p.id)) h where h ->> 'kind' = 'week_end' and (h ->> 'early')::boolean) then raise exception 'probe: history'; end if;
    g := public.verify_person(v_mgr, '424242');
    begin perform public.declare_week_end(gen_random_uuid(), (g ->> 'grant_id')::uuid, v_p.id); raise exception 'probe: declared twice';
    exception when others then if sqlerrm <> 'PERIOD_WEEK_ENDED' then raise; end if; end;

    -- 4. the freeze: after the declared end refused (service, and an advance without consuming its grant); before it accepted
    begin
      perform public.record_service(p_command_id => gen_random_uuid(), p_person_id => v_pro, p_service_id => v_svc, p_value_minor => 100000,
                p_payments => pay, p_occurred_at => now() + interval '2 minutes');
      raise exception 'probe: service after the end accepted';
    exception when others then if sqlerrm <> 'PERIOD_WEEK_ENDED' then raise; end if; end;
    begin
      perform public.record_advance(gen_random_uuid(), (g ->> 'grant_id')::uuid, v_pro, 5000, v_cash, null, null, now() + interval '2 minutes');
      raise exception 'probe: advance after the end accepted';
    exception when others then if sqlerrm <> 'PERIOD_WEEK_ENDED' then raise; end if; end;
    if (select consumed_at from private.verification_grants where id = (g ->> 'grant_id')::uuid) is not null then raise exception 'probe: frozen advance consumed the grant'; end if;
    r := public.record_service(p_command_id => gen_random_uuid(), p_person_id => v_pro, p_service_id => v_svc, p_value_minor => 100000,
           p_payments => pay, p_occurred_at => now() - interval '10 minutes');                 -- captured offline before the end, sent now
    if r ->> 'record_id' is null then raise exception 'probe: earlier work refused %', r; end if;
    r := public.record_advance(gen_random_uuid(), (g ->> 'grant_id')::uuid, v_pro, 5000, v_cash, null, null, now() - interval '10 minutes');
    if r is null then raise exception 'probe: earlier draft refused'; end if;

    -- 5. withdrawal: recorded; inputs accepted again; re-declared after the usual closing time (early = false)
    g := public.verify_person(v_mgr, '424242');
    r := public.withdraw_week_end(gen_random_uuid(), (g ->> 'grant_id')::uuid, v_p.id);
    if (select count(*) from public.period_week_end_events where period_id = v_p.id) <> 2 or private.period_declared_end(v_p.id) is not null then raise exception 'probe: withdrawal'; end if;
    r := public.record_service(p_command_id => gen_random_uuid(), p_person_id => v_pro, p_service_id => v_svc, p_value_minor => 100000,
           p_payments => pay, p_occurred_at => now() + interval '2 minutes');
    if r ->> 'record_id' is null then raise exception 'probe: input after withdrawal %', r; end if;
    g := public.verify_person(v_mgr, '424242');
    begin perform public.withdraw_week_end(gen_random_uuid(), (g ->> 'grant_id')::uuid, v_p.id); raise exception 'probe: withdrew nothing';
    exception when others then if sqlerrm <> 'WEEK_NOT_ENDED' then raise; end if; end;
    update public.organizations set usual_closing_time = time '00:00' where id = v_org;
    r := public.declare_week_end(gen_random_uuid(), (g ->> 'grant_id')::uuid, v_p.id);
    if (r ->> 'early')::boolean is not false then raise exception 'probe: normal declaration %', r; end if;
    if (select count(*) from public.period_week_end_events where period_id = v_p.id) <> 3 then raise exception 'probe: re-declaration'; end if;
    if not exists (select 1 from jsonb_array_elements(public.fecho_history(v_p.id)) h where h ->> 'kind' = 'week_end_withdrawn') then raise exception 'probe: withdrawal history'; end if;

    -- 6. the guard: its end is the declaration; reports not after it are silent; a support device is excluded
    if (private.period_device_sync(v_org, v_p) ->> 'period_ends_at')::timestamptz <> now() then raise exception 'probe: guard end'; end if;
    if private.period_device_sync(v_org, v_p) - 'period_ends_at' <> '{"ready": 0, "pending": 0, "silent": 2, "safe": false}'::jsonb then
      raise exception 'probe: guard before %', private.period_device_sync(v_org, v_p); end if;
    if (public.fecho_sync_status(v_p.id) -> 'week_end' ->> 'declared_at')::timestamptz <> now() then raise exception 'probe: status %', public.fecho_sync_status(v_p.id); end if;
    perform private.admin_set_device_purpose(v_d2, 'support', 'probe');
    if private.period_device_sync(v_org, v_p) - 'period_ends_at' <> '{"ready": 0, "pending": 0, "silent": 1, "safe": false}'::jsonb
       or jsonb_array_length(private.period_device_sync_detail(v_org, v_p)) <> 1 then raise exception 'probe: support counted'; end if;
    v_rev := (select review_revision from public.periods where id = v_p.id);
    g := public.verify_person(v_mgr, '424242');
    begin perform public.approve_period(gen_random_uuid(), (g ->> 'grant_id')::uuid, v_p.id, v_rev); raise exception 'probe: approved while a phone is silent';
    exception when others then if sqlerrm <> 'PERIOD_OFFLINE_SYNC_PENDING' then raise; end if; end;
    update private.device_sync_reports set reported_at = now() + interval '1 second' where device_id = v_d1;   -- its next zero report, after the end
    if private.period_device_sync(v_org, v_p) - 'period_ends_at' <> '{"ready": 1, "pending": 0, "silent": 0, "safe": true}'::jsonb then
      raise exception 'probe: guard after %', private.period_device_sync(v_org, v_p); end if;

    -- 7. approval with the same grant (the refusal consumed nothing); then withdrawal refused; annulment; withdrawal allowed
    r := public.approve_period(gen_random_uuid(), (g ->> 'grant_id')::uuid, v_p.id, v_rev);
    v_rev := (r ->> 'review_revision')::bigint;
    g := public.verify_person(v_mgr, '424242');
    begin perform public.withdraw_week_end(gen_random_uuid(), (g ->> 'grant_id')::uuid, v_p.id); raise exception 'probe: withdrew after approval';
    exception when others then if sqlerrm <> 'PERIOD_STATE_INVALID' then raise; end if; end;
    perform public.annul_approval(gen_random_uuid(), (g ->> 'grant_id')::uuid, v_p.id, v_rev);
    g := public.verify_person(v_mgr, '424242');
    perform public.withdraw_week_end(gen_random_uuid(), (g ->> 'grant_id')::uuid, v_p.id);
    if private.period_declared_end(v_p.id) is not null then raise exception 'probe: withdrawal after annulment'; end if;

    -- 8. execution rights
    if not has_function_privilege('authenticated', 'public.declare_week_end(uuid, uuid, uuid)', 'execute')
       or has_function_privilege('anon', 'public.declare_week_end(uuid, uuid, uuid)', 'execute')
       or has_function_privilege('anon', 'public.withdraw_week_end(uuid, uuid, uuid)', 'execute')
       or has_function_privilege('authenticated', 'private.admin_set_week_schedule(uuid, smallint, time)', 'execute')
       or has_function_privilege('authenticated', 'private.period_operational_end(public.periods)', 'execute') then raise exception 'probe: execution rights'; end if;

    raise exception 'probe_ok';
  exception when others then
    if sqlerrm <> 'probe_ok' then raise; end if;
  end;
end $$;
