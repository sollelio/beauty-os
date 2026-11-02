-- Production by payment method in the Fecho — Beauty OS Dev only.
-- NEVER run against production (Beauty OS Prod) or any project other than Beauty OS Dev (plukxnjnmowlnplpgsnm).
-- Every execution, including on Dev, needs explicit approval from Sollelio. It is not part of `npm run test:db` and
-- must not be added to any automated or scheduled runner.
-- A throwaway salon with one past week, read through public.fecho_period in the private context as a phone would, then
-- approved, paid and closed through the real commands. Checked:
--   · cash only, transfer only, and both methods for one professional; a mixed service counts each stored part under its
--     own method (no allocation); professionals do not contaminate each other; the methods add up to each production total;
--   · a professional with no service in the week: no methods, reconciled;
--   · a cancelled service (cancel_record) and a service of another week are left out, exactly as in the production total;
--   · Aberto, Pronto para pagamento and Fechado (close statement) give the same breakdown;
--   · parts that no longer match (tampered here, impossible through record_service) withhold that person's methods —
--     never an approximate breakdown — while the others are still given;
--   · the field needs the same authorization as the rest of the Fecho (private context); the helper is not callable by
--     browser roles.
-- Rollback: ONE statement (a DO block); every write happens in an inner block that always ends in an exception, so its
-- savepoint is rolled back — 'probe_ok' on success (caught), the failed check otherwise (re-raised).
-- Run (Beauty OS Dev only; after `cat supabase/.temp/project-ref` shows the same ref):
--   npx supabase db query --linked -f tests/sql/fecho_production_methods_probe.sql
-- Success: an empty result. Failure: the CLI prints the server error ('probe: …' for a failed check).
do $$
declare
  c_a uuid := '00000000-0000-4000-8000-0000000000a1';
  c_tz text := 'Africa/Luanda';
  v_today date := (now() at time zone 'Africa/Luanda')::date;
  v_org uuid := gen_random_uuid(); v_mgr uuid := gen_random_uuid(); v_svc uuid := gen_random_uuid();
  v_cash uuid := gen_random_uuid(); v_tr uuid := gen_random_uuid();
  v_ana uuid := gen_random_uuid(); v_bea uuid := gen_random_uuid(); v_caio uuid := gen_random_uuid(); v_dora uuid := gen_random_uuid();
  v_code text := upper('PROBE-PM-' || substr(md5(random()::text), 1, 8));
  v_week uuid; v_start date := v_today - 14; v_u uuid; v_s uuid; v_dev uuid; v_r uuid; v_mixed uuid; v_rev bigint; f jsonb; v_expect jsonb; v_state text;
begin
  if not exists (select 1 from public.organizations where id = c_a and name = 'Teste Isolamento A') then
    raise exception 'probe: Dev fixtures not found — not the Beauty OS Dev database; nothing was written';
  end if;

  begin
    insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values (v_org, 'Probe Métodos', c_tz, 'AOA', 2, 'Kz');
    insert into public.people (id, organization_id, display_name) values (v_mgr, v_org, 'Gestor Probe'),
      (v_ana, v_org, 'Ana'), (v_bea, v_org, 'Bea'), (v_caio, v_org, 'Caio'), (v_dora, v_org, 'Dora');
    insert into private.person_secrets (person_id, organization_id, secret_hash) values (v_mgr, v_org, extensions.crypt('454545', extensions.gen_salt('bf', 4)));
    insert into private.person_permissions (organization_id, person_id, permission) values (v_org, v_mgr, 'team.finance.read'),
      (v_org, v_mgr, 'period.decide'), (v_org, v_mgr, 'payment.confirm'), (v_org, v_mgr, 'period.close'), (v_org, v_mgr, 'records.correct');
    insert into public.services (id, organization_id, name, default_price_minor) values (v_svc, v_org, 'Serviço Probe', 100000);
    insert into public.payment_methods (id, organization_id, code, label, sort_order) values (v_cash, v_org, 'numerario', 'Numerário', 1), (v_tr, v_org, 'transferencia', 'Transferência', 2);
    perform private.admin_set_rule(p, 'standing', 50, v_today - 60, v_mgr) from unnest(array[v_ana, v_bea, v_caio, v_dora]) p;
    insert into private.enrollment_codes (code_hash, organization_id, label, expires_at, max_uses)
      values (encode(extensions.digest(v_code, 'sha256'), 'hex'), v_org, 'Telemóvel probe', now() + interval '1 hour', 1);
    v_u := gen_random_uuid(); v_s := gen_random_uuid();
    insert into auth.users (id, aud, role, is_anonymous) values (v_u, 'authenticated', 'authenticated', true);
    insert into auth.sessions (id, user_id) values (v_s, v_u);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_u, 'session_id', v_s, 'role', 'authenticated', 'is_anonymous', true)::text, true);
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    perform public.redeem_enrollment(v_code);
    select cd.device_id into v_dev from private.current_device() cd;

    -- a past Monday–Saturday week, the next one, and the current one (no week covers the Sunday between them)
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'Semana', v_start, v_start + 5) returning id into v_week;
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'Seguinte', v_start + 7, v_start + 12);
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'Atual', v_today, v_today + 5);

    -- Ana: cash only (40.000 + 15.000) · Bea: transfer only (60.000) · Caio: 20.000 cash, 30.000 transfer and a mixed
    -- 25.000 (10.000 cash + 15.000 transfer) · Dora: no service in the week (one in the next week, 99.000 cash)
    -- Ana also has a 70.000 cash service that is cancelled below
    insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, device_id, command_id)
      values (v_org, v_ana, v_svc, 4000000, 'single', (v_start)::timestamp at time zone c_tz + interval '10 hours', v_dev, gen_random_uuid()) returning id into v_r;
    insert into public.service_record_payments values (v_r, v_org, v_cash, 4000000);
    insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, device_id, command_id)
      values (v_org, v_ana, v_svc, 1500000, 'single', (v_start + 5)::timestamp at time zone c_tz + interval '23 hours 30 minutes', v_dev, gen_random_uuid()) returning id into v_r;
    insert into public.service_record_payments values (v_r, v_org, v_cash, 1500000);
    insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, device_id, command_id)
      values (v_org, v_ana, v_svc, 7000000, 'single', (v_start + 2)::timestamp at time zone c_tz + interval '12 hours', v_dev, gen_random_uuid()) returning id into v_r;
    insert into public.service_record_payments values (v_r, v_org, v_cash, 7000000);
    perform public.cancel_record(gen_random_uuid(), (public.verify_person(v_mgr, '454545') ->> 'grant_id')::uuid, 'service', v_r, 'registo errado');
    insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, device_id, command_id)
      values (v_org, v_bea, v_svc, 6000000, 'single', (v_start + 1)::timestamp at time zone c_tz + interval '12 hours', v_dev, gen_random_uuid()) returning id into v_r;
    insert into public.service_record_payments values (v_r, v_org, v_tr, 6000000);
    insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, device_id, command_id)
      values (v_org, v_caio, v_svc, 2000000, 'single', (v_start + 1)::timestamp at time zone c_tz + interval '9 hours', v_dev, gen_random_uuid()) returning id into v_r;
    insert into public.service_record_payments values (v_r, v_org, v_cash, 2000000);
    insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, device_id, command_id)
      values (v_org, v_caio, v_svc, 3000000, 'single', (v_start + 3)::timestamp at time zone c_tz + interval '9 hours', v_dev, gen_random_uuid()) returning id into v_r;
    insert into public.service_record_payments values (v_r, v_org, v_tr, 3000000);
    insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, device_id, command_id)
      values (v_org, v_caio, v_svc, 2500000, 'mixed', (v_start + 4)::timestamp at time zone c_tz + interval '9 hours', v_dev, gen_random_uuid()) returning id into v_mixed;
    insert into public.service_record_payments values (v_mixed, v_org, v_cash, 1000000), (v_mixed, v_org, v_tr, 1500000);
    insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, device_id, command_id)
      values (v_org, v_dora, v_svc, 9900000, 'single', (v_start + 7)::timestamp at time zone c_tz + interval '9 hours', v_dev, gen_random_uuid()) returning id into v_r;
    insert into public.service_record_payments values (v_r, v_org, v_cash, 9900000);

    -- the helper is not callable by browser roles; fecho_period keeps its grants
    if has_function_privilege('authenticated', 'private.period_production_by_method(uuid,public.periods,jsonb)', 'execute')
       or has_function_privilege('anon', 'private.period_production_by_method(uuid,public.periods,jsonb)', 'execute')
       or has_function_privilege('anon', 'public.fecho_period(uuid)', 'execute')
       or not has_function_privilege('authenticated', 'public.fecho_period(uuid)', 'execute') then raise exception 'probe: privileges'; end if;
    -- without the private context the Fecho (and so the breakdown) stays closed, as before
    begin perform public.fecho_period(v_week); raise exception 'probe: fecho without private context';
    exception when others then if sqlerrm <> 'VERIFICATION_REQUIRED' then raise; end if; end;
    if (public.verify_person(v_mgr, '454545', 'private_session') ->> 'ok')::boolean is not true then raise exception 'probe: private context'; end if;

    v_expect := jsonb_build_object(
      v_ana::text, jsonb_build_object('reconciled', true, 'mixed_count', 0, 'methods', jsonb_build_array(
        jsonb_build_object('code', 'numerario', 'label', 'Numerário', 'amount_minor', 5500000, 'count', 2))),
      v_bea::text, jsonb_build_object('reconciled', true, 'mixed_count', 0, 'methods', jsonb_build_array(
        jsonb_build_object('code', 'transferencia', 'label', 'Transferência', 'amount_minor', 6000000, 'count', 1))),
      v_caio::text, jsonb_build_object('reconciled', true, 'mixed_count', 1, 'methods', jsonb_build_array(
        jsonb_build_object('code', 'numerario', 'label', 'Numerário', 'amount_minor', 3000000, 'count', 2),
        jsonb_build_object('code', 'transferencia', 'label', 'Transferência', 'amount_minor', 4500000, 'count', 2))),
      v_dora::text, jsonb_build_object('reconciled', true, 'mixed_count', 0, 'methods', '[]'::jsonb));

    -- the same breakdown while Aberto, once approved (Pronto para pagamento) and once paid and closed (close statement)
    foreach v_state in array array['aberto', 'pronto_para_pagamento', 'fechado'] loop
      if v_state = 'pronto_para_pagamento' then
        select review_revision into v_rev from public.periods where id = v_week;
        perform public.approve_period(gen_random_uuid(), (public.verify_person(v_mgr, '454545') ->> 'grant_id')::uuid, v_week, v_rev);
      elsif v_state = 'fechado' then
        perform public.confirm_payment(gen_random_uuid(), (public.verify_person(v_mgr, '454545') ->> 'grant_id')::uuid, v_week, p, (l ->> 'outstanding_minor')::bigint, v_cash)
           from jsonb_array_elements(public.fecho_period(v_week) -> 'approval' -> 'lines') l, lateral (select (l ->> 'person_id')::uuid as p) x
          where (l ->> 'outstanding_minor')::bigint > 0;
        select review_revision into v_rev from public.periods where id = v_week;
        perform public.close_period(gen_random_uuid(), (public.verify_person(v_mgr, '454545') ->> 'grant_id')::uuid, v_week, v_rev);
      end if;
      f := public.fecho_period(v_week);
      if f -> 'period' ->> 'state' is distinct from v_state then raise exception 'probe: state % %', v_state, f -> 'period' ->> 'state'; end if;
      if v_state = 'fechado' and f ->> 'source' is distinct from 'close_statement' then raise exception 'probe: not from the close statement'; end if;
      if (select jsonb_object_agg(x ->> 'person_id', x - 'person_id') from jsonb_array_elements(f -> 'production_by_method') x) is distinct from v_expect then
        raise exception 'probe: breakdown (%) %', v_state, f -> 'production_by_method'; end if;
      -- every person of the Fecho is there, and the methods add up to the production total the Fecho shows
      if jsonb_array_length(f -> 'production_by_method') <> jsonb_array_length(f -> 'position' -> 'people')
         or exists (select 1 from jsonb_array_elements(f -> 'position' -> 'people') p
                     where (p -> 'production' ->> 'total_minor')::bigint is distinct from
                           (select coalesce(sum((m ->> 'amount_minor')::bigint), 0) from jsonb_array_elements(f -> 'production_by_method') x, jsonb_array_elements(x -> 'methods') m
                             where x ->> 'person_id' = p ->> 'person_id')) then raise exception 'probe: does not add up (%)', v_state; end if;
      if (f -> 'position' -> 'production' ->> 'total_minor')::bigint <> 5500000 + 6000000 + 7500000 then raise exception 'probe: production total (%)', v_state; end if;
    end loop;

    -- parts that no longer add up (tampered; record_service refuses this): Caio's methods withheld, the others kept
    update public.service_record_payments set amount_minor = 500000 where service_record_id = v_mixed and payment_method_id = v_cash;
    f := public.fecho_period(v_week);
    if (select x from jsonb_array_elements(f -> 'production_by_method') x where x ->> 'person_id' = v_caio::text)
       is distinct from jsonb_build_object('person_id', v_caio, 'reconciled', false, 'mixed_count', null, 'methods', null)
       or (select x - 'person_id' from jsonb_array_elements(f -> 'production_by_method') x where x ->> 'person_id' = v_ana::text) is distinct from v_expect -> v_ana::text then
      raise exception 'probe: mismatch %', f -> 'production_by_method'; end if;

    raise exception 'probe_ok';
  exception when others then
    if sqlerrm <> 'probe_ok' then raise; end if;
  end;
end $$;
