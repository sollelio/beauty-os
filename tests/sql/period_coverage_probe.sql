-- Period coverage probe (Slice 4) — Beauty OS Dev only.
-- NEVER run against production (Beauty OS Prod) or any project other than Beauty OS Dev (plukxnjnmowlnplpgsnm).
-- Every execution, including on Dev, needs explicit approval from Sollelio. It is not part of `npm run test:db` and
-- must not be added to any automated or scheduled runner.
-- Coverage depends on the real date and on periods only an operator creates, so this probe builds throwaway
-- organizations inside the transaction — periods relative to today in Africa/Luanda: yesterday plays the Saturday that
-- ends a Monday–Saturday period, today the uncovered Sunday, tomorrow starts the next period — and drives the real
-- commands as a phone would (a synthetic anonymous session enrolled with public.redeem_enrollment). Checked:
--   · default period: only a future period → PERIOD_NOT_FOUND (never the future week); on the uncovered day the period
--     that just ended (Fecho, team situation, Business Health agree), never the next one; a covered day → its period;
--   · a Monday–Saturday period ends at Sunday 00:00 without a declaration; its last operating day is its Saturday;
--   · online capture on the uncovered day: service, advance, expense and purchase all NO_PERIOD_FOR_DATE — nothing
--     written, nothing journaled, the one-shot grant not consumed;
--   · offline captures sent later: Saturday before the declared end → accepted into that period; Saturday after it →
--     PERIOD_WEEK_ENDED; Sunday → NO_PERIOD_FOR_DATE (its time unchanged, nothing written); the accepted command
--     replays exactly once; the refused one is refused again, never journaled;
--   · the guard on the Monday–Saturday period ends at the declaration; a phone not heard from after it blocks approval;
--   · once a period covers today, online capture enters it;
--   · a calendar week (fixed dates): Saturday → its week, Sunday → NO_PERIOD_FOR_DATE, Monday → the next week;
--   · shortening future Monday–Sunday periods to the schedule: only the future, empty, untouched Aberto one changes
--     (start kept, Saturday end, label), audited; started, recorded, declared, approved and aligned ones are skipped
--     with their reason; idempotent; browser roles cannot run it;
--   · Teste Isolamento A is covered today (seed 23).
-- Rollback: ONE statement (a DO block); every write happens in an inner block that always ends in an exception, so its
-- savepoint is rolled back — 'probe_ok' on success (caught), the failed check otherwise (re-raised).
-- Run (Beauty OS Dev only; after `cat supabase/.temp/project-ref` shows the same ref):
--   npx supabase db query --linked -f tests/sql/period_coverage_probe.sql
-- Success: an empty result. Failure: the CLI prints the server error ('probe: …' for a failed check).
do $$
declare
  c_a uuid := '00000000-0000-4000-8000-0000000000a1';          -- Teste Isolamento A (seed 01; covering period in seed 23)
  c_tz text := 'Africa/Luanda';
  v_today date := (now() at time zone 'Africa/Luanda')::date; v_y date;
  v_org uuid := gen_random_uuid(); v_mgr uuid := gen_random_uuid(); v_pro uuid := gen_random_uuid(); v_svc uuid := gen_random_uuid();
  v_cash uuid := gen_random_uuid(); v_cat uuid := gen_random_uuid(); v_prod uuid := gen_random_uuid();
  v_code text := upper('PROBE-COVER-' || substr(md5(random()::text), 1, 8));
  v_prev public.periods; v_next public.periods; v_cur public.periods; v_w1 uuid; v_w2 uuid; v_cm date;
  v_u uuid; v_s uuid; v_dev uuid; r jsonb; g jsonb; v_c1 uuid; v_c2 uuid; v_c3 uuid; v_c4 uuid; v_c5 uuid; v_c6 uuid;
  v_sat_before timestamptz; v_sat_after timestamptz; v_sun timestamptz; v_rev bigint; pay jsonb; pay5 jsonb;
  v_sorg uuid := gen_random_uuid(); v_sp uuid := gen_random_uuid(); v_ss uuid := gen_random_uuid(); v_mon date;
  v_empty uuid; v_rec uuid; v_decl uuid; v_appr uuid; v_alig uuid; v_scur uuid; v_spast uuid;
begin
  v_y := v_today - 1;
  if not exists (select 1 from public.organizations where id = c_a and name = 'Teste Isolamento A') then
    raise exception 'probe: Dev fixtures not found — not the Beauty OS Dev database; nothing was written';
  end if;
  pay := jsonb_build_array(jsonb_build_object('method_id', v_cash, 'amount_minor', 100000));
  pay5 := jsonb_build_array(jsonb_build_object('method_id', v_cash, 'amount_minor', 5000));

  begin
    -- a throwaway salon whose Saturday is yesterday's weekday: manager (Fecho, Negócio, confirmations; synthetic PIN), one professional
    insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol, week_last_operating_day, usual_closing_time)
      values (v_org, 'Probe Cobertura', c_tz, 'AOA', 2, 'Kz', extract(isodow from v_y)::smallint, time '20:00');
    insert into public.people (id, organization_id, display_name) values (v_mgr, v_org, 'Gestor Probe'), (v_pro, v_org, 'Profissional Probe');
    insert into public.person_capabilities (organization_id, person_id, label) values (v_org, v_pro, 'Cabelo');
    insert into private.person_secrets (person_id, organization_id, secret_hash) values (v_mgr, v_org, extensions.crypt('434343', extensions.gen_salt('bf', 4)));
    insert into private.person_permissions (organization_id, person_id, permission) values
      (v_org, v_mgr, 'period.decide'), (v_org, v_mgr, 'team.finance.read'), (v_org, v_mgr, 'business.health.read'), (v_org, v_mgr, 'movement.confirm');
    insert into public.services (id, organization_id, name, default_price_minor) values (v_svc, v_org, 'Serviço Probe', 100000);
    insert into public.payment_methods (id, organization_id, code, label) values (v_cash, v_org, 'numerario', 'Numerário');
    insert into public.expense_categories (id, organization_id, label) values (v_cat, v_org, 'Água');
    insert into public.unit_words (organization_id, word) values (v_org, 'frasco');
    insert into public.products (id, organization_id, name, unit_word) values (v_prod, v_org, 'Champô Probe', 'frasco');
    perform private.admin_set_rule(v_pro, 'standing', 50, v_today - 30, v_mgr);
    insert into private.enrollment_codes (code_hash, organization_id, label, expires_at, max_uses)
      values (encode(extensions.digest(v_code, 'sha256'), 'hex'), v_org, 'Telemóvel probe', now() + interval '1 hour', 2);
    v_u := gen_random_uuid(); v_s := gen_random_uuid();
    insert into auth.users (id, aud, role, is_anonymous) values (v_u, 'authenticated', 'authenticated', true);
    insert into auth.sessions (id, user_id) values (v_s, v_u);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_u, 'session_id', v_s, 'role', 'authenticated', 'is_anonymous', true)::text, true);
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    perform public.redeem_enrollment(v_code);
    select cd.device_id into v_dev from private.current_device() cd;
    if v_dev is null then raise exception 'probe: phone not enrolled'; end if;
    perform public.report_device_sync('{"days": [], "undated": {}}'::jsonb);
    if (public.verify_person(v_mgr, '434343', 'private_session') ->> 'ok')::boolean is not true then raise exception 'probe: private context'; end if;

    -- 1. only a future period: no default period (never the future week)
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'Probe seguinte', v_today + 1, v_today + 6) returning * into v_next;
    begin perform public.fecho_period(null); raise exception 'probe: a future period served as the default';
    exception when others then if sqlerrm <> 'PERIOD_NOT_FOUND' then raise; end if; end;

    -- 2. the uncovered day: the period that just ended (Monday–Saturday, ending yesterday) — Fecho, situation, Business Health agree
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'Probe anterior', v_today - 6, v_y) returning * into v_prev;
    if (private.resolve_period(null)).id is distinct from v_prev.id or public.fecho_period(null) -> 'period' ->> 'id' is distinct from v_prev.id::text
       or public.team_situation(v_pro) -> 'period' ->> 'id' is distinct from v_prev.id::text
       or public.business_health() -> 'current' -> 'period' ->> 'id' is distinct from v_prev.id::text then
      raise exception 'probe: default on the uncovered day'; end if;
    if private.period_operational_end(v_prev) is distinct from v_today::timestamp at time zone c_tz
       or (private.period_week_end(v_prev) ->> 'last_operating_day')::date is distinct from v_y then raise exception 'probe: Monday–Saturday end %', private.period_week_end(v_prev); end if;

    -- 3. online capture on the uncovered day: refused for all four, nothing written or journaled, the grant kept
    v_c1 := gen_random_uuid(); v_c2 := gen_random_uuid(); v_c3 := gen_random_uuid(); v_c4 := gen_random_uuid();
    g := public.verify_person(v_mgr, '434343');
    begin perform public.record_service(p_command_id => v_c1, p_person_id => v_pro, p_service_id => v_svc, p_value_minor => 100000, p_payments => pay);
      raise exception 'probe: uncovered service accepted';
    exception when others then if sqlerrm <> 'NO_PERIOD_FOR_DATE' then raise; end if; end;
    begin perform public.record_advance(v_c2, (g ->> 'grant_id')::uuid, v_pro, 5000, v_cash); raise exception 'probe: uncovered advance accepted';
    exception when others then if sqlerrm <> 'NO_PERIOD_FOR_DATE' then raise; end if; end;
    begin perform public.record_expense(v_c3, (g ->> 'grant_id')::uuid, v_cat, 5000, pay5); raise exception 'probe: uncovered expense accepted';
    exception when others then if sqlerrm <> 'NO_PERIOD_FOR_DATE' then raise; end if; end;
    begin perform public.record_purchase(v_c4, (g ->> 'grant_id')::uuid, jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1, 'line_cost_minor', 5000)),
                                         5000, '[]'::jsonb);
      raise exception 'probe: uncovered purchase accepted';
    exception when others then if sqlerrm <> 'NO_PERIOD_FOR_DATE' then raise; end if; end;
    if (select consumed_at from private.verification_grants where id = (g ->> 'grant_id')::uuid) is not null then raise exception 'probe: a refusal consumed the grant'; end if;
    if (select count(*) from public.service_records where organization_id = v_org) + (select count(*) from public.advances where organization_id = v_org)
       + (select count(*) from public.expenses where organization_id = v_org) + (select count(*) from public.purchases where organization_id = v_org) <> 0
       or exists (select 1 from private.command_journal where command_id in (v_c1, v_c2, v_c3, v_c4)) then raise exception 'probe: something was written'; end if;

    -- 4. offline captures sent today, around yesterday's declared end (20:00)
    insert into public.period_week_end_events (organization_id, period_id, kind, at, person_id, early, usual_closing_at, command_id)
      values (v_org, v_prev.id, 'declared', v_today::timestamp at time zone c_tz - interval '4 hours', v_mgr, false,
              v_today::timestamp at time zone c_tz - interval '4 hours', gen_random_uuid());
    v_sat_before := v_today::timestamp at time zone c_tz - interval '5 hours';            -- Saturday 19:00
    v_sat_after := v_today::timestamp at time zone c_tz - interval '3 hours';             -- Saturday 21:00
    v_sun := greatest(now() - interval '1 minute', v_today::timestamp at time zone c_tz + interval '1 second');
    v_c5 := gen_random_uuid(); v_c6 := gen_random_uuid();
    r := public.record_service(p_command_id => v_c5, p_person_id => v_pro, p_service_id => v_svc, p_value_minor => 100000, p_payments => pay, p_occurred_at => v_sat_before);
    if private.period_for(v_org, (r ->> 'occurred_at')::timestamptz) is distinct from v_prev.id then raise exception 'probe: Saturday work not in its period %', r; end if;
    begin perform public.record_service(p_command_id => gen_random_uuid(), p_person_id => v_pro, p_service_id => v_svc, p_value_minor => 100000, p_payments => pay, p_occurred_at => v_sat_after);
      raise exception 'probe: Saturday after the end accepted';
    exception when others then if sqlerrm <> 'PERIOD_WEEK_ENDED' then raise; end if; end;
    begin perform public.record_service(p_command_id => v_c6, p_person_id => v_pro, p_service_id => v_svc, p_value_minor => 100000, p_payments => pay, p_occurred_at => v_sun);
      raise exception 'probe: Sunday accepted';
    exception when others then if sqlerrm <> 'NO_PERIOD_FOR_DATE' then raise; end if; end;
    begin perform public.record_advance(gen_random_uuid(), (g ->> 'grant_id')::uuid, v_pro, 5000, v_cash, null, null, v_sun); raise exception 'probe: Sunday advance accepted';
    exception when others then if sqlerrm <> 'NO_PERIOD_FOR_DATE' then raise; end if; end;
    if (select consumed_at from private.verification_grants where id = (g ->> 'grant_id')::uuid) is not null then raise exception 'probe: Sunday refusal consumed the grant'; end if;
    r := public.record_service(p_command_id => v_c5, p_person_id => v_pro, p_service_id => v_svc, p_value_minor => 100000, p_payments => pay, p_occurred_at => v_sat_before);
    if (r ->> 'replayed')::boolean is not true or (select count(*) from public.service_records where command_id = v_c5) <> 1 then raise exception 'probe: replay %', r; end if;
    begin perform public.record_service(p_command_id => v_c6, p_person_id => v_pro, p_service_id => v_svc, p_value_minor => 100000, p_payments => pay, p_occurred_at => v_sun);
      raise exception 'probe: Sunday accepted on retry';
    exception when others then if sqlerrm <> 'NO_PERIOD_FOR_DATE' then raise; end if; end;
    if exists (select 1 from public.service_records where command_id = v_c6) or exists (select 1 from private.command_journal where command_id = v_c6) then
      raise exception 'probe: Sunday written'; end if;
    if (select count(*) from public.service_records where organization_id = v_org) <> 1 then raise exception 'probe: records'; end if;

    -- the guard on the Monday–Saturday period: its end is the declaration; a phone last heard from before it blocks approval
    if (private.period_device_sync(v_org, v_prev) ->> 'period_ends_at')::timestamptz is distinct from v_today::timestamp at time zone c_tz - interval '4 hours' then raise exception 'probe: guard end'; end if;
    update private.device_sync_reports set reported_at = v_sat_before where device_id = v_dev;
    v_rev := (select review_revision from public.periods where id = v_prev.id);
    begin perform public.approve_period(gen_random_uuid(), (g ->> 'grant_id')::uuid, v_prev.id, v_rev); raise exception 'probe: approved with a silent phone';
    exception when others then if sqlerrm <> 'PERIOD_OFFLINE_SYNC_PENDING' then raise; end if; end;
    update private.device_sync_reports set reported_at = now() where device_id = v_dev;
    if (private.period_device_sync(v_org, v_prev) ->> 'safe')::boolean is not true then raise exception 'probe: guard after the report'; end if;

    -- 5. a covered day: once a period covers today, online capture enters it and it is the default
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'Probe hoje', v_today, v_today) returning * into v_cur;
    r := public.record_service(p_command_id => gen_random_uuid(), p_person_id => v_pro, p_service_id => v_svc, p_value_minor => 100000, p_payments => pay);
    if private.period_for(v_org, (r ->> 'occurred_at')::timestamptz) is distinct from v_cur.id or (private.resolve_period(null)).id is distinct from v_cur.id then raise exception 'probe: covered day %', r; end if;

    -- 6. a calendar week, fixed dates (direct inserts as the owner: the trigger is the rule)
    v_cm := date '2031-03-03' - (extract(isodow from date '2031-03-03')::int - 1);       -- a Monday
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'Semana 1', v_cm, v_cm + 5) returning id into v_w1;
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'Semana 2', v_cm + 7, v_cm + 12) returning id into v_w2;
    if extract(isodow from v_cm + 6) <> 7 then raise exception 'probe: calendar'; end if;
    insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, device_id, command_id)
      values (v_org, v_pro, v_svc, 100000, 'single', (v_cm + 5)::timestamp at time zone c_tz + interval '19 hours', v_dev, gen_random_uuid());     -- Saturday 19:00
    begin
      insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, device_id, command_id)
        values (v_org, v_pro, v_svc, 100000, 'single', (v_cm + 6)::timestamp at time zone c_tz + interval '12 hours', v_dev, gen_random_uuid());   -- Sunday
      raise exception 'probe: calendar Sunday accepted';
    exception when others then if sqlerrm <> 'NO_PERIOD_FOR_DATE' then raise; end if; end;
    insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, device_id, command_id)
      values (v_org, v_pro, v_svc, 100000, 'single', (v_cm + 7)::timestamp at time zone c_tz + interval '9 hours', v_dev, gen_random_uuid());      -- Monday 09:00
    if private.period_for(v_org, (v_cm + 5)::timestamp at time zone c_tz + interval '19 hours') is distinct from v_w1
       or private.period_for(v_org, (v_cm + 7)::timestamp at time zone c_tz + interval '9 hours') is distinct from v_w2 then raise exception 'probe: calendar attribution'; end if;

    -- 7. future Monday–Sunday periods to the schedule (a second throwaway salon, Saturday 20:00)
    v_mon := v_today + (8 - extract(isodow from v_today)::int);                            -- next Monday
    insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol, week_last_operating_day, usual_closing_time)
      values (v_sorg, 'Probe Encurtar', c_tz, 'AOA', 2, 'Kz', 6, time '20:00');
    insert into public.people (id, organization_id, display_name) values (v_sp, v_sorg, 'Pessoa');
    insert into public.services (id, organization_id, name, default_price_minor) values (v_ss, v_sorg, 'Serviço', 100000);
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_sorg, 'past', v_mon - 14, v_mon - 8) returning id into v_spast;
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_sorg, 'current', v_mon - 7, v_mon - 1) returning id into v_scur;
    insert into public.periods (organization_id, label, starts_on, ends_on)
      values (v_sorg, 'Semana ' || to_char(v_mon, 'DD/MM') || '–' || to_char(v_mon + 6, 'DD/MM'), v_mon, v_mon + 6) returning id into v_empty;
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_sorg, 'recorded', v_mon + 7, v_mon + 13) returning id into v_rec;
    insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, device_id, command_id)
      values (v_sorg, v_sp, v_ss, 100000, 'single', (v_mon + 8)::timestamp at time zone c_tz + interval '10 hours', gen_random_uuid(), gen_random_uuid());
    update public.periods set review_revision = 0 where id = v_rec;                       -- only the record itself marks it
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_sorg, 'declared', v_mon + 14, v_mon + 20) returning id into v_decl;
    insert into public.period_week_end_events (organization_id, period_id, kind, at, person_id, early, usual_closing_at, command_id)
      values (v_sorg, v_decl, 'declared', now(), v_sp, false, now(), gen_random_uuid());
    insert into public.periods (organization_id, label, starts_on, ends_on, state) values (v_sorg, 'approved', v_mon + 21, v_mon + 27, 'pronto_para_pagamento') returning id into v_appr;
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_sorg, 'aligned', v_mon + 28, v_mon + 33) returning id into v_alig;
    r := private.admin_shorten_future_periods_to_schedule(v_sorg, 'probe');
    if (r ->> 'applied')::boolean or jsonb_array_length(r -> 'eligible') <> 1 or r -> 'eligible' -> 0 ->> 'period_id' is distinct from v_empty::text
       or (select jsonb_object_agg(s ->> 'label', s ->> 'reason') from jsonb_array_elements(r -> 'skipped') s)
          is distinct from jsonb_build_object('past', 'started', 'current', 'started', 'recorded', 'has_records', 'declared', 'has_history', 'approved', 'not_open',
                                'aligned', 'already_ends_on_operating_day') then raise exception 'probe: dry run %', r; end if;
    if exists (select 1 from private.security_audit where action = 'period_shortened' and organization_id = v_sorg) then raise exception 'probe: dry run audited'; end if;
    r := private.admin_shorten_future_periods_to_schedule(v_sorg, 'probe', true);
    if (select (starts_on, ends_on, label) from public.periods where id = v_empty)
         is distinct from (v_mon, v_mon + 5, 'Semana ' || to_char(v_mon, 'DD/MM') || '–' || to_char(v_mon + 5, 'DD/MM'))
       or (select array_agg(ends_on order by starts_on) from public.periods where organization_id = v_sorg and id <> v_empty)
         is distinct from array[v_mon - 8, v_mon - 1, v_mon + 13, v_mon + 20, v_mon + 27, v_mon + 33] then raise exception 'probe: applied %', r; end if;
    if (select count(*) from private.security_audit where action = 'period_shortened' and organization_id = v_sorg and subject = v_empty
          and (detail -> 'ends_on' ->> 'from')::date = v_mon + 6 and (detail -> 'ends_on' ->> 'to')::date = v_mon + 5 and detail ->> 'reason' = 'probe') <> 1
       or (select count(*) from private.security_audit where action = 'period_shortened' and organization_id = v_sorg) <> 1 then raise exception 'probe: audit'; end if;
    if jsonb_array_length(private.admin_shorten_future_periods_to_schedule(v_sorg, 'probe', true) -> 'changed') <> 0 then raise exception 'probe: second run changed'; end if;
    begin perform private.admin_shorten_future_periods_to_schedule(v_sorg, ' '); raise exception 'probe: empty reason';
    exception when others then if sqlerrm <> 'VALIDATION_FAILED' then raise; end if; end;
    if has_function_privilege('authenticated', 'private.admin_shorten_future_periods_to_schedule(uuid, text, boolean)', 'execute')
       or has_function_privilege('anon', 'private.admin_shorten_future_periods_to_schedule(uuid, text, boolean)', 'execute') then raise exception 'probe: procedure exposed'; end if;

    -- 8. Teste Isolamento A is covered today (seed 23): its captures keep working
    if private.period_for(c_a, now()) is null then raise exception 'probe: Teste Isolamento A not covered today'; end if;

    raise exception 'probe_ok';
  exception when others then
    if sqlerrm <> 'probe_ok' then raise; end if;
  end;
end $$;
