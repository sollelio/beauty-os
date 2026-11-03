-- Period lifecycle (20261103000100) — Beauty OS Dev only.
-- NEVER run against production (Beauty OS Prod) or any project other than Beauty OS Dev (plukxnjnmowlnplpgsnm).
-- Every execution, including on Dev, needs explicit approval from Sollelio. It is not part of `npm run test:db` and
-- must not be added to any automated or scheduled runner.
-- Two throwaway salons with a Monday–Saturday schedule (Africa/Luanda), read and driven through the public API from
-- enrolled devices as a phone would. Dates are relative to the real local today (the checks adapt on a Sunday). Checked:
--   · a pre-created future week ('aberto') has not started: no approval, period rule, reserve allocation or owners'
--     decision (PERIOD_NOT_STARTED), not offered for approval, absent from the Fecho / Negócio / Situação lists;
--   · no current week yet: ensure_current_period() creates today's Monday–Saturday week, then the Fecho and Business Health
--     open on it as the current period (before it, the default was the last started week); calling it again is a no-op;
--   · capture: the first record of a day with no period creates its week in the same transaction (record_service);
--     a Sunday stays NO_PERIOD_FOR_DATE; a salon without a schedule keeps NO_PERIOD_FOR_DATE;
--   · weeks after 03/04/2027 are generated the same way (and are not started until their Monday);
--   · the current week works as before (rule, owners' decision, approval); a closed week is unchanged;
--   · the removal procedure removes a never-used period (audited) and refuses a used, closed or recent one;
--   · Business Health stays calendar-correct (20261103000200): the previous week is the immediately preceding one —
--     a missing week gives no comparison ('previous_missing'), never an older week; the 3-week average stops at a missing
--     week instead of reaching past it; any Business Health read of a period that has not started is PERIOD_NOT_STARTED.
-- Concurrent creation of one week by two transactions is checked separately (two sessions; see the report).
-- Rollback: ONE statement (a DO block); every write happens in an inner block that always ends in an exception, so its
-- savepoint is rolled back — 'probe_ok' on success (caught), the failed check otherwise (re-raised).
-- Run (Beauty OS Dev only; after `cat supabase/.temp/project-ref` shows the same ref):
--   npx supabase db query --linked -f tests/sql/period_lifecycle_probe.sql
-- Success: an empty result. Failure: the CLI prints the server error ('probe: …' for a failed check).
do $$
declare
  c_a uuid := '00000000-0000-4000-8000-0000000000a1';
  c_tz text := 'Africa/Luanda';
  t date := (now() at time zone 'Africa/Luanda')::date;
  mon date := (now() at time zone 'Africa/Luanda')::date - (extract(isodow from (now() at time zone 'Africa/Luanda')::date)::int - 1);
  operating boolean := extract(isodow from (now() at time zone 'Africa/Luanda')::date)::int <= 6;
  v_org uuid := gen_random_uuid(); v_orgb uuid := gen_random_uuid(); v_bare uuid := gen_random_uuid();
  v_mgr uuid := gen_random_uuid(); v_pro uuid := gen_random_uuid(); v_ctx uuid := gen_random_uuid(); v_prob uuid := gen_random_uuid();
  v_svc uuid := gen_random_uuid(); v_svcb uuid := gen_random_uuid(); v_cash uuid := gen_random_uuid(); v_cashb uuid := gen_random_uuid();
  w uuid[] := '{}'; v_bh jsonb; i int;
  v_past uuid; v_used uuid; v_empty uuid; v_fut uuid; v_late uuid; v_cur uuid; v_id uuid; v_r uuid; v_rev bigint; f jsonb; v_list jsonb; v_code text; v_u uuid; v_s uuid; v_dev uuid; e text;
  v_g text;
begin
  if not exists (select 1 from public.organizations where id = c_a and name = 'Teste Isolamento A') then
    raise exception 'probe: Dev fixtures not found — not the Beauty OS Dev database; nothing was written';
  end if;

  begin
    -- salon A (Fecho, lists, guards) and salon B (capture), both Monday–Saturday; salon "bare" without a schedule
    insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values
      (v_org, 'Probe Ciclo A', c_tz, 'AOA', 2, 'Kz'), (v_orgb, 'Probe Ciclo B', c_tz, 'AOA', 2, 'Kz'), (v_bare, 'Probe Ciclo sem horário', c_tz, 'AOA', 2, 'Kz');
    perform private.admin_set_week_schedule(o, 1::smallint, 6::smallint, time '20:00') from unnest(array[v_org, v_orgb]) o;
    insert into public.people (id, organization_id, display_name) values (v_mgr, v_org, 'Gestor Probe'), (v_pro, v_org, 'Pro Probe'), (v_ctx, v_org, 'Ctx Probe'),
      (v_prob, v_orgb, 'Pro B');
    insert into private.person_secrets (person_id, organization_id, secret_hash) values (v_mgr, v_org, extensions.crypt('454545', extensions.gen_salt('bf', 4)));
    insert into private.person_permissions (organization_id, person_id, permission) values (v_org, v_mgr, 'team.finance.read'), (v_org, v_mgr, 'business.health.read'),
      (v_org, v_mgr, 'period.decide'), (v_org, v_mgr, 'payment.confirm'), (v_org, v_mgr, 'period.close');
    insert into public.services (id, organization_id, name, default_price_minor) values (v_svc, v_org, 'Serviço Probe', 100000), (v_svcb, v_orgb, 'Serviço B', 100000);
    insert into public.payment_methods (id, organization_id, code, label) values (v_cash, v_org, 'numerario', 'Numerário'), (v_cashb, v_orgb, 'numerario', 'Numerário');
    perform private.admin_set_rule(v_pro, 'standing', 50, mon - 60, v_mgr);
    perform private.admin_set_rule(v_ctx, 'contextual', null, mon - 20, v_mgr);
    perform private.admin_set_rule(v_prob, 'standing', 50, mon - 60, v_prob);

    -- pre-created weeks of salon A: four weeks ago (never used), three (used, a cancelled service), two (closed), next week
    -- (future) — no period for last week or this week yet
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'Vazia', mon - 28, mon - 23) returning id into v_empty;
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'Usada', mon - 21, mon - 16) returning id into v_used;
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'Fechada', mon - 14, mon - 9) returning id into v_past;
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'Futura', mon + 7, mon + 12) returning id into v_fut;
    insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, device_id, command_id)
      values (v_org, v_pro, v_svc, 100000, 'single', (mon - 20)::timestamp at time zone c_tz + interval '12 hours', gen_random_uuid(), gen_random_uuid()) returning id into v_r;
    insert into public.record_cancellations (organization_id, record_kind, record_id, period_id, reason, cancelled_by_person_id, command_id)
      values (v_org, 'service', v_r, v_used, 'teste', v_mgr, gen_random_uuid());
    insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, device_id, command_id)
      values (v_org, v_pro, v_svc, 100000, 'single', (mon - 13)::timestamp at time zone c_tz + interval '12 hours', gen_random_uuid(), gen_random_uuid()) returning id into v_r;
    insert into public.service_record_payments values (v_r, v_org, v_cash, 100000);

    -- device of salon A, private context of the manager
    v_code := upper('PROBE-CY-' || substr(md5(random()::text), 1, 8));
    insert into private.enrollment_codes (code_hash, organization_id, label, expires_at, max_uses)
      values (encode(extensions.digest(v_code, 'sha256'), 'hex'), v_org, 'Telemóvel probe', now() + interval '1 hour', 1);
    v_u := gen_random_uuid(); v_s := gen_random_uuid();
    insert into auth.users (id, aud, role, is_anonymous) values (v_u, 'authenticated', 'authenticated', true);
    insert into auth.sessions (id, user_id) values (v_s, v_u);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_u, 'session_id', v_s, 'role', 'authenticated', 'is_anonymous', true)::text, true);
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    perform public.redeem_enrollment(v_code);
    if (public.verify_person(v_mgr, '454545', 'private_session') ->> 'ok')::boolean is not true then raise exception 'probe: private context'; end if;

    -- the closed week (history): rule, approve, pay, close
    perform public.decide_period_rule(gen_random_uuid(), (public.verify_person(v_mgr, '454545') ->> 'grant_id')::uuid, v_past, v_ctx, 40);
    select review_revision into v_rev from public.periods where id = v_past;
    perform public.approve_period(gen_random_uuid(), (public.verify_person(v_mgr, '454545') ->> 'grant_id')::uuid, v_past, v_rev);
    perform public.confirm_payment(gen_random_uuid(), (public.verify_person(v_mgr, '454545') ->> 'grant_id')::uuid, v_past, v_pro, 50000, v_cash);
    select review_revision into v_rev from public.periods where id = v_past;
    perform public.close_period(gen_random_uuid(), (public.verify_person(v_mgr, '454545') ->> 'grant_id')::uuid, v_past, v_rev);

    -- Business Health, calendar-correct: weeks W1–W3, a missing week, W5–W8 (all approved, all past)
    for i in 1..8 loop
      if i = 4 then w := w || null::uuid; continue; end if;
      insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'W' || i, mon - 91 + 7 * i, mon - 86 + 7 * i) returning id into v_id;
      w := w || v_id;
      select review_revision into v_rev from public.periods where id = v_id;
      perform public.approve_period(gen_random_uuid(), (public.verify_person(v_mgr, '454545') ->> 'grant_id')::uuid, v_id, v_rev);
    end loop;
    -- the immediately previous week exists (W2 → W1): compared
    v_bh := public.business_health(w[2]) -> 'meta' -> 'comparison';
    if (v_bh -> 'previous' ->> 'available')::boolean is not true or v_bh -> 'previous' -> 'period' ->> 'id' is distinct from w[1]::text then raise exception 'probe: W2 previous %', v_bh -> 'previous'; end if;
    -- the immediately previous week is missing (W5): no comparison, W3 does not stand in
    v_bh := public.business_health(w[5]);
    if (v_bh -> 'meta' -> 'comparison' -> 'previous' ->> 'available')::boolean is not false
       or v_bh -> 'meta' -> 'comparison' -> 'previous' ->> 'reason' is distinct from 'previous_missing'
       or v_bh -> 'meta' -> 'comparison' -> 'previous' ->> 'period' is not null
       or v_bh -> 'previous' ->> 'production_minor' is not null then raise exception 'probe: W5 previous %', v_bh -> 'meta' -> 'comparison' -> 'previous'; end if;
    -- the same in Equipa and Serviços; Serviços' second step (W6 → W5 → missing) stops there too
    if public.business_team(w[5]) -> 'comparison' ->> 'reason' is distinct from 'previous_missing'
       or public.business_services(w[5]) -> 'comparison' -> 'previous' ->> 'reason' is distinct from 'previous_missing'
       or public.business_services(w[6]) -> 'comparison' -> 'previous' ->> 'reason' is not null
       or public.business_services(w[6]) -> 'comparison' -> 'before_previous' ->> 'reason' is distinct from 'previous_missing' then raise exception 'probe: Equipa / Serviços W5, W6'; end if;
    -- the 3-week window stops at the missing week: W7 (W6, W5, gap) has no average — W3 is not taken; W8 averages W7, W6, W5
    v_bh := public.business_health(w[7]) -> 'meta' -> 'comparison' -> 'average_3';
    if (v_bh ->> 'available')::boolean is not false or v_bh ->> 'reason' is distinct from 'insufficient_history' then raise exception 'probe: W7 average %', v_bh; end if;
    v_bh := public.business_health(w[8]) -> 'meta' -> 'comparison' -> 'average_3';
    if (v_bh ->> 'available')::boolean is not true then raise exception 'probe: W8 average %', v_bh; end if;
    if (select array_agg(x ->> 'id' order by x ->> 'id') from jsonb_array_elements(public.business_health(w[8]) -> 'average_3' -> 'periods') x)
       is distinct from (select array_agg(u::text order by u::text) from unnest(array[w[7], w[6], w[5]]) u) then raise exception 'probe: W8 window %', public.business_health(w[8]) -> 'average_3' -> 'periods'; end if;

    -- Monday morning, before any record: the default is still the last started week (no current period yet) …
    f := public.fecho_period(null);
    if f -> 'period' ->> 'id' is distinct from v_past::text or (f -> 'period' ->> 'is_current')::boolean then raise exception 'probe: default before ensure %', f -> 'period'; end if;
    -- … ensure_current_period() creates today's Monday–Saturday week (none on a Sunday); again, it is a no-op
    if (public.ensure_current_period() ->> 'ensured')::boolean is distinct from operating then raise exception 'probe: ensure'; end if;
    if (public.ensure_current_period() ->> 'ensured')::boolean is distinct from operating then raise exception 'probe: ensure again'; end if;
    if (select count(*) from public.periods where organization_id = v_org and starts_on = mon) <> (case when operating then 1 else 0 end) then raise exception 'probe: one current week'; end if;
    if operating then
      select id into v_cur from public.periods where organization_id = v_org and starts_on = mon and ends_on = mon + 5
        and label = 'Semana ' || to_char(mon, 'DD/MM') || '–' || to_char(mon + 5, 'DD/MM') and state = 'aberto';
      if v_cur is null then raise exception 'probe: current week shape'; end if;
      if (select count(*) from private.security_audit where organization_id = v_org and action = 'period_generated' and subject = v_cur) <> 1 then raise exception 'probe: generated audit'; end if;
      f := public.fecho_period(null);
      if f -> 'period' ->> 'id' is distinct from v_cur::text or (f -> 'period' ->> 'is_current')::boolean is not true then raise exception 'probe: Fecho default %', f -> 'period'; end if;
      if public.business_health(null) -> 'current' -> 'period' ->> 'id' is distinct from v_cur::text then raise exception 'probe: Business Health default'; end if;
    end if;

    -- weeks after 03/04/2027 are generated the same way; a Sunday never
    v_late := private.ensure_week_period(v_org, date '2027-05-05');
    if (select array[starts_on, ends_on]::date[] from public.periods where id = v_late) is distinct from array[date '2027-05-03', date '2027-05-08']
       or (select label from public.periods where id = v_late) <> 'Semana 03/05–08/05' then raise exception 'probe: 2027 week'; end if;
    if private.ensure_week_period(v_org, date '2027-05-09') is not null then raise exception 'probe: 2027 Sunday'; end if;

    -- not started (pre-created next week, generated May 2027 week): no Fecho decision, not offered, not listed
    foreach v_id in array array[v_fut, v_late] loop
      select review_revision into v_rev from public.periods where id = v_id;
      foreach e in array array['approve', 'rule', 'reserve', 'owners'] loop
        v_g := public.verify_person(v_mgr, '454545') ->> 'grant_id';
        begin
          case e
            when 'approve' then perform public.approve_period(gen_random_uuid(), v_g::uuid, v_id, v_rev);
            when 'rule' then perform public.decide_period_rule(gen_random_uuid(), v_g::uuid, v_id, v_ctx, 40);
            when 'reserve' then perform public.allocate_reserve(gen_random_uuid(), v_g::uuid, v_id, 10000, null);
            when 'owners' then perform public.record_owners_decision(gen_random_uuid(), v_g::uuid, v_id, 'none', null);
          end case;
          raise exception 'probe: % accepted on a period that has not started', e;
        exception when others then if sqlerrm <> 'PERIOD_NOT_STARTED' then raise; end if; end;
      end loop;
      if (public.fecho_period(v_id) -> 'readiness' ->> 'can_approve')::boolean then raise exception 'probe: approval offered before start'; end if;
      if (select state from public.periods where id = v_id) <> 'aberto' then raise exception 'probe: state changed'; end if;
    end loop;
    foreach e in array array['fecho', 'business', 'team'] loop
      v_list := case e when 'fecho' then public.fecho_periods() when 'business' then public.business_periods() else public.team_periods(v_pro) end;
      if exists (select 1 from jsonb_array_elements(v_list) x where x ->> 'id' in (v_fut::text, v_late::text))
         or not exists (select 1 from jsonb_array_elements(v_list) x where x ->> 'id' = v_past::text)
         or (operating and not exists (select 1 from jsonb_array_elements(v_list) x where x ->> 'id' = v_cur::text))
         or exists (select 1 from jsonb_array_elements(v_list) x where (x ->> 'starts_on')::date > t) then raise exception 'probe: % list %', e, v_list; end if;
    end loop;

    -- Business Health never gives a period that has not started, even by id (the pre-created next week, the May 2027 one)
    foreach v_id in array array[v_fut, v_late] loop
      foreach e in array array['business_health', 'business_team', 'business_services', 'business_costs', 'business_finance'] loop
        begin
          execute format('select public.%I($1)', e) using v_id;
          raise exception 'probe: % gave a period that has not started', e;
        exception when others then if sqlerrm <> 'PERIOD_NOT_STARTED' then raise; end if; end;
      end loop;
    end loop;
    if public.business_health(v_past) -> 'current' -> 'period' ->> 'id' is distinct from v_past::text then raise exception 'probe: Business Health of a started period'; end if;

    -- the current week works as before: a period rule, an owners' decision, approval
    if operating then
      perform public.decide_period_rule(gen_random_uuid(), (public.verify_person(v_mgr, '454545') ->> 'grant_id')::uuid, v_cur, v_ctx, 40);
      perform public.record_owners_decision(gen_random_uuid(), (public.verify_person(v_mgr, '454545') ->> 'grant_id')::uuid, v_cur, 'none', null);
      select review_revision into v_rev from public.periods where id = v_cur;
      perform public.approve_period(gen_random_uuid(), (public.verify_person(v_mgr, '454545') ->> 'grant_id')::uuid, v_cur, v_rev);
      if (select state from public.periods where id = v_cur) <> 'pronto_para_pagamento' then raise exception 'probe: current week approval'; end if;
    end if;

    -- the closed week is unchanged: closed, from its close statement
    f := public.fecho_period(v_past);
    if f -> 'period' ->> 'state' <> 'fechado' or f ->> 'source' <> 'close_statement' then raise exception 'probe: closed week %', f -> 'period'; end if;

    -- removal: the never-used week goes (audited); a used, a closed, a future one stay
    f := private.admin_remove_empty_period(v_empty, 'semana de arranque sem atividade');     -- (its own statement: checked after it)
    if f ->> 'removed' is distinct from v_empty::text or exists (select 1 from public.periods where id = v_empty)
       or (select detail ->> 'label' from private.security_audit where action = 'period_removed' and subject = v_empty) <> 'Vazia' then raise exception 'probe: removal'; end if;
    begin perform private.admin_remove_empty_period(v_used, 'x'); raise exception 'probe: removed a used week';
    exception when others then if sqlerrm <> 'PERIOD_NOT_EMPTY' then raise; end if; end;
    begin perform private.admin_remove_empty_period(v_past, 'x'); raise exception 'probe: removed a closed week';
    exception when others then if sqlerrm <> 'PERIOD_STATE_INVALID' then raise; end if; end;
    begin perform private.admin_remove_empty_period(v_fut, 'x'); raise exception 'probe: removed a future week';
    exception when others then if sqlerrm <> 'PERIOD_IN_CAPTURE_WINDOW' then raise; end if; end;
    begin perform private.admin_remove_empty_period(v_empty, 'x'); raise exception 'probe: removed twice';
    exception when others then if sqlerrm <> 'NOT_FOUND' then raise; end if; end;

    -- salon B: a device records the first service of the day — its week is created in the same transaction
    v_code := upper('PROBE-CB-' || substr(md5(random()::text), 1, 8));
    insert into private.enrollment_codes (code_hash, organization_id, label, expires_at, max_uses)
      values (encode(extensions.digest(v_code, 'sha256'), 'hex'), v_orgb, 'Telemóvel B', now() + interval '1 hour', 1);
    v_u := gen_random_uuid(); v_s := gen_random_uuid();
    insert into auth.users (id, aud, role, is_anonymous) values (v_u, 'authenticated', 'authenticated', true);
    insert into auth.sessions (id, user_id) values (v_s, v_u);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_u, 'session_id', v_s, 'role', 'authenticated', 'is_anonymous', true)::text, true);
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    perform public.redeem_enrollment(v_code);
    select cd.device_id into v_dev from private.current_device() cd;
    begin
      perform public.record_service(gen_random_uuid(), v_prob, v_svcb, 300000, jsonb_build_array(jsonb_build_object('method_id', v_cashb, 'amount_minor', 300000)), null, null);
      if not operating then raise exception 'probe: a Sunday record was accepted'; end if;
    exception when others then if operating or sqlerrm <> 'NO_PERIOD_FOR_DATE' then raise; end if; end;
    if operating and (select count(*) from public.periods where organization_id = v_orgb and starts_on = mon and ends_on = mon + 5) <> 1 then raise exception 'probe: capture week'; end if;
    if operating and (select count(*) from private.active_service_records r join public.periods p on p.organization_id = r.organization_id
                       and (r.occurred_at at time zone c_tz)::date between p.starts_on and p.ends_on where r.organization_id = v_orgb and p.starts_on = mon) <> 1 then raise exception 'probe: record in its week'; end if;
    -- a Sunday stays uncovered (the period trigger, whatever the capture path); a salon without a schedule too
    begin
      insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, device_id, command_id)
        values (v_orgb, v_prob, v_svcb, 100000, 'single', (mon - 1)::timestamp at time zone c_tz + interval '12 hours', v_dev, gen_random_uuid());
      raise exception 'probe: Sunday covered';
    exception when others then if sqlerrm <> 'NO_PERIOD_FOR_DATE' then raise; end if; end;
    if private.ensure_week_period(v_bare, mon + 2) is not null then raise exception 'probe: schedule-less week'; end if;

    raise exception 'probe_ok';
  exception when others then
    if sqlerrm <> 'probe_ok' then raise; end if;
  end;
end $$;
