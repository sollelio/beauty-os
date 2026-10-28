-- Business Health comparisons against approved periods (weekly accrual + flexible later payment) — Beauty OS Dev only.
-- NEVER run against production (Beauty OS Prod) or any project other than Beauty OS Dev (plukxnjnmowlnplpgsnm).
-- Every execution, including on Dev, needs explicit approval from Sollelio. It is not part of `npm run test:db` and
-- must not be added to any automated or scheduled runner.
-- A throwaway salon with five past weeks in every state a week can be in — Fechado (paid and closed), Em pagamento
-- (approved, partly paid), Pronto para pagamento (approved, unpaid), Aberto (not approved) — built through the real
-- commands (approve_period, confirm_payment, close_period) as a phone would, then read through public.business_health.
-- Checked:
--   · an approved week (Em pagamento, Pronto para pagamento) and a closed one are the previous comparison period;
--   · an Aberto week is not ('previous_not_approved');
--   · the 3-period average uses approved weeks, closed or not;
--   · Livre (and the reserve) is final only at close: a reserve allocation recorded in an approved week changes its Livre,
--     so against an approved week that is not closed Livre is not compared (no previous value, no change, not averaged)
--     while the fixed figures are; once the weeks are paid and closed, Livre is compared again;
--   · the unpaid amounts of the open approved weeks stay per week and add up across weeks;
--   · paying and closing are unchanged: a week with something unpaid does not close (UNPAID_APPROVED_AMOUNTS); a payment
--     above what is left for that week is refused (PAYMENT_EXCEEDS_APPROVED).
-- Rollback: ONE statement (a DO block); every write happens in an inner block that always ends in an exception, so its
-- savepoint is rolled back — 'probe_ok' on success (caught), the failed check otherwise (re-raised).
-- Run (Beauty OS Dev only; after `cat supabase/.temp/project-ref` shows the same ref):
--   npx supabase db query --linked -f tests/sql/business_approved_comparison_probe.sql
-- Success: an empty result. Failure: the CLI prints the server error ('probe: …' for a failed check).
do $$
declare
  c_a uuid := '00000000-0000-4000-8000-0000000000a1';
  c_tz text := 'Africa/Luanda';
  v_today date := (now() at time zone 'Africa/Luanda')::date;
  v_org uuid := gen_random_uuid(); v_mgr uuid := gen_random_uuid(); v_pro uuid := gen_random_uuid(); v_svc uuid := gen_random_uuid(); v_cash uuid := gen_random_uuid();
  v_code text := upper('PROBE-BH-' || substr(md5(random()::text), 1, 8));
  v_p uuid[] := '{}'; v_id uuid; i int; v_u uuid; v_s uuid; v_dev uuid; h jsonb; v_rev bigint; v_livre bigint;
begin
  if not exists (select 1 from public.organizations where id = c_a and name = 'Teste Isolamento A') then
    raise exception 'probe: Dev fixtures not found — not the Beauty OS Dev database; nothing was written';
  end if;

  begin
    insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values (v_org, 'Probe Negócio', c_tz, 'AOA', 2, 'Kz');
    insert into public.people (id, organization_id, display_name) values (v_mgr, v_org, 'Gestor Probe'), (v_pro, v_org, 'Profissional Probe');
    insert into public.person_capabilities (organization_id, person_id, label) values (v_org, v_pro, 'Cabelo');
    insert into private.person_secrets (person_id, organization_id, secret_hash) values (v_mgr, v_org, extensions.crypt('454545', extensions.gen_salt('bf', 4)));
    insert into private.person_permissions (organization_id, person_id, permission) values (v_org, v_mgr, 'team.finance.read'), (v_org, v_mgr, 'business.health.read'),
      (v_org, v_mgr, 'period.decide'), (v_org, v_mgr, 'payment.confirm'), (v_org, v_mgr, 'period.close');
    insert into public.services (id, organization_id, name, default_price_minor) values (v_svc, v_org, 'Serviço Probe', 100000);
    insert into public.payment_methods (id, organization_id, code, label) values (v_cash, v_org, 'numerario', 'Numerário');
    perform private.admin_set_rule(v_pro, 'standing', 50, v_today - 60, v_mgr);
    insert into private.enrollment_codes (code_hash, organization_id, label, expires_at, max_uses)
      values (encode(extensions.digest(v_code, 'sha256'), 'hex'), v_org, 'Telemóvel probe', now() + interval '1 hour', 1);
    v_u := gen_random_uuid(); v_s := gen_random_uuid();
    insert into auth.users (id, aud, role, is_anonymous) values (v_u, 'authenticated', 'authenticated', true);
    insert into auth.sessions (id, user_id) values (v_s, v_u);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_u, 'session_id', v_s, 'role', 'authenticated', 'is_anonymous', true)::text, true);
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    perform public.redeem_enrollment(v_code);
    select cd.device_id into v_dev from private.current_device() cd;
    if (public.verify_person(v_mgr, '454545', 'private_session') ->> 'ok')::boolean is not true then raise exception 'probe: private context'; end if;

    -- five complete past weeks (P1 oldest … P5 yesterday) and the current one; one 1.000 Kz service in each past week
    for i in 1..5 loop
      insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'P' || i, v_today - 42 + 7 * i, v_today - 36 + 7 * i) returning id into v_id;
      v_p := v_p || v_id;
      insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, device_id, command_id)
        values (v_org, v_pro, v_svc, 100000, 'single', (v_today - 39 + 7 * i)::timestamp at time zone c_tz + interval '12 hours', v_dev, gen_random_uuid());
    end loop;
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'Atual', v_today, v_today + 6);

    -- P1: approved, paid in full, closed · P2: approved, 200 Kz of 500 paid · P3: approved, unpaid · P4, P5: Aberto
    for i in 1..3 loop
      select review_revision into v_rev from public.periods where id = v_p[i];
      perform public.approve_period(gen_random_uuid(), (public.verify_person(v_mgr, '454545') ->> 'grant_id')::uuid, v_p[i], v_rev);
    end loop;
    perform public.confirm_payment(gen_random_uuid(), (public.verify_person(v_mgr, '454545') ->> 'grant_id')::uuid, v_p[1], v_pro, 50000, v_cash);
    select review_revision into v_rev from public.periods where id = v_p[1];
    perform public.close_period(gen_random_uuid(), (public.verify_person(v_mgr, '454545') ->> 'grant_id')::uuid, v_p[1], v_rev);
    perform public.confirm_payment(gen_random_uuid(), (public.verify_person(v_mgr, '454545') ->> 'grant_id')::uuid, v_p[2], v_pro, 20000, v_cash);
    if (select array_agg(state order by starts_on) from public.periods where id = any (v_p))
       is distinct from array['fechado', 'em_pagamento', 'pronto_para_pagamento', 'aberto', 'aberto'] then raise exception 'probe: states'; end if;

    -- previous period: closed (P2 → P1), partly paid (P3 → P2), approved unpaid (P4 → P3): comparable; Aberto (P5 → P4): not
    for i in 2..4 loop
      h := public.business_health(v_p[i]) -> 'meta' -> 'comparison' -> 'previous';
      if (h ->> 'available')::boolean is not true or h ->> 'reason' is not null or h -> 'period' ->> 'id' is distinct from v_p[i - 1]::text then
        raise exception 'probe: previous of P% %', i, h; end if;
    end loop;
    h := public.business_health(v_p[5]) -> 'meta' -> 'comparison' -> 'previous';
    if (h ->> 'available')::boolean is not false or h ->> 'reason' is distinct from 'previous_not_approved' then raise exception 'probe: Aberto previous %', h; end if;

    -- the 3-period average: P4 averages P3, P2, P1 (approved, closed or not); P3 has only two approved weeks before it
    h := public.business_health(v_p[4]) -> 'meta' -> 'comparison' -> 'average_3';
    if (h ->> 'available')::boolean is not true then raise exception 'probe: average for P4 %', h; end if;
    h := public.business_health(v_p[3]) -> 'meta' -> 'comparison' -> 'average_3';
    if (h ->> 'available')::boolean is not false or h ->> 'reason' is distinct from 'insufficient_history' then raise exception 'probe: average for P3 %', h; end if;

    -- unpaid amounts: per open approved week (P2 300 Kz, P3 500 Kz), 800 Kz across weeks; the closed week is not open
    h := public.business_health(v_p[5]) -> 'open_periods';
    if (select jsonb_object_agg(x ->> 'label', (x ->> 'unpaid_team_minor')::bigint) from jsonb_array_elements(h) x where (x ->> 'unpaid_team_minor')::bigint > 0)
       is distinct from jsonb_build_object('P2', 30000, 'P3', 50000)
       or (select sum((x ->> 'unpaid_team_minor')::bigint) from jsonb_array_elements(h) x) <> 80000
       or exists (select 1 from jsonb_array_elements(h) x where x ->> 'id' = v_p[1]::text) then raise exception 'probe: unpaid %', h; end if;

    -- Livre is final only at close: an allocation in the approved, partly paid P2 changes P2's Livre
    v_livre := (public.business_health(v_p[2]) -> 'current' ->> 'free_minor')::bigint;
    perform public.allocate_reserve(gen_random_uuid(), (public.verify_person(v_mgr, '454545') ->> 'grant_id')::uuid, v_p[2], 10000);
    if (public.business_health(v_p[2]) -> 'current' ->> 'free_minor')::bigint is distinct from v_livre - 10000 then raise exception 'probe: Livre after the allocation'; end if;
    -- … so P3 (previous P2, approved, not closed) compares every fixed figure but not Livre or the reserve
    h := public.business_health(v_p[3]);
    if h -> 'previous' ? 'free_minor' or h -> 'previous' ? 'reserve_allocated_minor' or h -> 'changes' -> 'previous' -> 'free_minor' ->> 'delta_minor' is not null
       or (h -> 'previous' ->> 'production_minor')::bigint is distinct from 100000 or h -> 'changes' -> 'previous' -> 'production_minor' ->> 'delta_minor' is null
       or h -> 'changes' -> 'previous' -> 'operating_result_minor' ->> 'delta_minor' is null then raise exception 'probe: Livre against an approved week %', h -> 'previous'; end if;
    -- … P2 (previous P1, closed) compares Livre too
    h := public.business_health(v_p[2]);
    if (h -> 'previous' ->> 'free_minor') is null or h -> 'changes' -> 'previous' -> 'free_minor' ->> 'delta_minor' is null then raise exception 'probe: Livre against a closed week %', h -> 'previous'; end if;
    -- … and P4's average (window P3, P2, P1: two not closed) averages the fixed figures, not Livre
    h := public.business_health(v_p[4]) -> 'average_3';
    if h ? 'free_minor' or (h ->> 'production_minor')::bigint is distinct from 100000 then raise exception 'probe: average with open weeks %', h; end if;

    -- paying and closing unchanged
    select review_revision into v_rev from public.periods where id = v_p[2];
    begin perform public.close_period(gen_random_uuid(), (public.verify_person(v_mgr, '454545') ->> 'grant_id')::uuid, v_p[2], v_rev); raise exception 'probe: closed with unpaid';
    exception when others then if sqlerrm <> 'UNPAID_APPROVED_AMOUNTS' then raise; end if; end;
    begin perform public.confirm_payment(gen_random_uuid(), (public.verify_person(v_mgr, '454545') ->> 'grant_id')::uuid, v_p[2], v_pro, 30001, v_cash); raise exception 'probe: overpaid';
    exception when others then if sqlerrm <> 'PAYMENT_EXCEEDS_APPROVED' then raise; end if; end;

    -- paying P2 and P3 in full lets them close; then Livre is compared and averaged again (all three of P4's window closed)
    perform public.confirm_payment(gen_random_uuid(), (public.verify_person(v_mgr, '454545') ->> 'grant_id')::uuid, v_p[2], v_pro, 30000, v_cash);
    perform public.confirm_payment(gen_random_uuid(), (public.verify_person(v_mgr, '454545') ->> 'grant_id')::uuid, v_p[3], v_pro, 50000, v_cash);
    for i in 2..3 loop
      select review_revision into v_rev from public.periods where id = v_p[i];
      perform public.close_period(gen_random_uuid(), (public.verify_person(v_mgr, '454545') ->> 'grant_id')::uuid, v_p[i], v_rev);
    end loop;
    h := public.business_health(v_p[4]);
    if not (h -> 'average_3' ? 'free_minor') or (h -> 'previous' ->> 'free_minor') is null or h -> 'changes' -> 'previous' -> 'free_minor' ->> 'delta_minor' is null
       or h -> 'changes' -> 'average_3' -> 'free_minor' ->> 'delta_minor' is null then
      raise exception 'probe: Livre with closed weeks %', h; end if;
    if (h -> 'previous' ->> 'free_minor')::bigint is distinct from (public.business_health(v_p[3]) -> 'current' ->> 'free_minor')::bigint then raise exception 'probe: P3 Livre'; end if;

    raise exception 'probe_ok';
  exception when others then
    if sqlerrm <> 'probe_ok' then raise; end if;
  end;
end $$;
