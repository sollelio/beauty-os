-- Business Health Slice 02 (Negócio → Equipa). Synthetic, not pilot data.
-- "Teste Equipa D" (code TEST-ORG-D-2026), used by tests/db/business_team and the browser smoke.
--   dd21–dd24 professionals (standing 40/40/30/30; each period's earnings advanced in full, so nothing is left to pay)
--   dd25 manager: team.finance.read + business.health.read, PIN 616161 · dd26 business.health.read only, PIN 626262
--   dd27 no permissions, PIN 636363
-- Five 7-day periods from 2025-03-03 (Kz, per professional D1/D2/D3/D4):
--   D1 closed   100.000 (10) · 50.000 (5) · 50.000 (5) ·      —        → one professional 50%
--   D2 closed    70.000 (7) · 66.000 (6) · 32.000 (4) · 32.000 (4)    → two professionals 68% (none ≥ 40%)
--   D3 closed    80.000 (8) · 20.000 (2) · cancelled 50.000 · —       → two active only: no concentration insight
--   D4 open      no services                                          → zero production
--   D5 open      30.000 (3) · 30.000 (3) · 30.000 (3) · 10.000 (1)    → below both thresholds; previous not closed
insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values
  ('00000000-0000-4000-8000-0000000000d1', 'Teste Equipa D', 'Africa/Luanda', 'AOA', 2, 'Kz') on conflict (id) do nothing;
insert into private.enrollment_codes (code_hash, organization_id, label, expires_at, max_uses) values
  (encode(extensions.digest('TEST-ORG-D-2026', 'sha256'), 'hex'), '00000000-0000-4000-8000-0000000000d1', 'Test device D', '2027-12-31', 100000)
on conflict (code_hash) do nothing;
insert into public.payment_methods (id, organization_id, code, label, sort_order) values
  ('00000000-0000-4000-8000-00000000dd01', '00000000-0000-4000-8000-0000000000d1', 'numerario', 'Numerário', 1) on conflict (id) do nothing;
insert into public.services (id, organization_id, name, default_price_minor, sort_order) values
  ('00000000-0000-4000-8000-00000000dd31', '00000000-0000-4000-8000-0000000000d1', 'Serviço Teste D', 1000000, 1) on conflict (id) do nothing;
insert into public.people (id, organization_id, display_name) values
  ('00000000-0000-4000-8000-00000000dd21', '00000000-0000-4000-8000-0000000000d1', 'Profissional D1'),
  ('00000000-0000-4000-8000-00000000dd22', '00000000-0000-4000-8000-0000000000d1', 'Profissional D2'),
  ('00000000-0000-4000-8000-00000000dd23', '00000000-0000-4000-8000-0000000000d1', 'Profissional D3'),
  ('00000000-0000-4000-8000-00000000dd24', '00000000-0000-4000-8000-0000000000d1', 'Profissional D4'),
  ('00000000-0000-4000-8000-00000000dd25', '00000000-0000-4000-8000-0000000000d1', 'Gestor Teste D'),
  ('00000000-0000-4000-8000-00000000dd26', '00000000-0000-4000-8000-0000000000d1', 'Sócio Negócio D'),
  ('00000000-0000-4000-8000-00000000dd27', '00000000-0000-4000-8000-0000000000d1', 'Sem Permissões D')
on conflict (id) do nothing;
insert into private.person_secrets (person_id, organization_id, secret_hash) values
  ('00000000-0000-4000-8000-00000000dd25', '00000000-0000-4000-8000-0000000000d1', extensions.crypt('616161', extensions.gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-00000000dd26', '00000000-0000-4000-8000-0000000000d1', extensions.crypt('626262', extensions.gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-00000000dd27', '00000000-0000-4000-8000-0000000000d1', extensions.crypt('636363', extensions.gen_salt('bf', 8)))
on conflict (person_id) do nothing;
insert into private.person_permissions (organization_id, person_id, permission)
select '00000000-0000-4000-8000-0000000000d1'::uuid, '00000000-0000-4000-8000-00000000dd25'::uuid, perm
  from (values ('team.finance.read'), ('business.health.read'), ('movement.confirm'), ('period.decide'), ('payment.confirm'),
               ('period.close'), ('records.correct')) x(perm)
union all select '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000dd26', 'business.health.read'
on conflict do nothing;
insert into public.rule_versions (organization_id, person_id, kind, percent, effective_from, set_by_person_id, set_at)
select '00000000-0000-4000-8000-0000000000d1', p::uuid, 'standing', pct, '2000-01-01', '00000000-0000-4000-8000-00000000dd25', '2000-01-01 09:00+01'
  from (values ('00000000-0000-4000-8000-00000000dd21', 40), ('00000000-0000-4000-8000-00000000dd22', 40),
               ('00000000-0000-4000-8000-00000000dd23', 30), ('00000000-0000-4000-8000-00000000dd24', 30)) r(p, pct)
 where not exists (select 1 from public.rule_versions rv where rv.person_id = r.p::uuid);

do $$
declare
  v_org uuid := '00000000-0000-4000-8000-0000000000d1'; v_mgr uuid := '00000000-0000-4000-8000-00000000dd25';
  v_dev uuid := '00000000-0000-4000-8000-0000000daede'; v_cash uuid := '00000000-0000-4000-8000-00000000dd01';
  v_svc uuid := '00000000-0000-4000-8000-00000000dd31';
  -- per period: [count, value] for D1..D4, whether to close it, a cancelled service of D3
  v_spec jsonb := '[
    {"s": [[10, 1000000], [5, 1000000], [5, 1000000], [0, 0]],      "close": true},
    {"s": [[7, 1000000],  [6, 1100000], [4, 800000],  [4, 800000]], "close": true},
    {"s": [[8, 1000000],  [2, 1000000], [0, 0],       [0, 0]],      "close": true, "cancelled": true},
    {"s": [[0, 0], [0, 0], [0, 0], [0, 0]],                          "close": false},
    {"s": [[3, 1000000],  [3, 1000000], [3, 1000000], [1, 1000000]], "close": false}]';
  s jsonb; v_n int; j int; i int; v_start date; v_pid uuid; v_at timestamptz; v_rec uuid; v_p public.periods; v_pos jsonb; v_aid uuid; v_lines jsonb; x jsonb;
begin
  for v_n in 1..5 loop
    v_start := date '2025-03-03' + (v_n - 1) * 7;
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'Semana D' || v_n, v_start, v_start + 6)
    on conflict do nothing returning id into v_pid;
    if v_pid is null then continue; end if;
    s := v_spec -> (v_n - 1);
    v_at := (v_start::text || ' 12:00+01')::timestamptz;
    for j in 1..4 loop
      for i in 1..(s -> 's' -> (j - 1) ->> 0)::int loop
        insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, recorded_at, device_id, command_id)
        values (v_org, ('00000000-0000-4000-8000-00000000dd2' || j)::uuid, v_svc, (s -> 's' -> (j - 1) ->> 1)::bigint, 'single', v_at, v_at, v_dev, gen_random_uuid())
        returning id into v_rec;
        insert into public.service_record_payments values (v_rec, v_org, v_cash, (s -> 's' -> (j - 1) ->> 1)::bigint);
      end loop;
    end loop;
    if s ? 'cancelled' then
      insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, recorded_at, device_id, command_id)
      values (v_org, '00000000-0000-4000-8000-00000000dd23', v_svc, 5000000, 'single', v_at, v_at, v_dev, gen_random_uuid()) returning id into v_rec;
      insert into public.service_record_payments values (v_rec, v_org, v_cash, 5000000);
      insert into public.record_cancellations (organization_id, record_kind, record_id, period_id, reason, cancelled_by_person_id, command_id)
      values (v_org, 'service', v_rec, v_pid, 'Registo de teste anulado', v_mgr, gen_random_uuid());
    end if;
    if not (s ->> 'close')::boolean then continue; end if;

    select * into v_p from public.periods where id = v_pid;
    for x in select y from jsonb_array_elements(private.period_position(v_org, v_p) -> 'people') y where (y ->> 'earned_minor')::bigint > 0 loop
      insert into public.advances (organization_id, person_id, amount_minor, payment_method_id, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id)
      values (v_org, (x ->> 'person_id')::uuid, (x ->> 'earned_minor')::bigint, v_cash, v_at, v_at, v_dev, v_mgr, gen_random_uuid());
    end loop;
    v_pos := private.period_position(v_org, v_p);              -- approve and close (as approve_period / close_period do)
    insert into public.period_approvals (organization_id, period_id, approved_by_person_id, approved_at, review_revision, calculation_version, totals, cases, command_id)
    values (v_org, v_pid, v_mgr, v_at + interval '7 days', v_p.review_revision, private.calculation_version(), v_pos - 'people', '[]'::jsonb, gen_random_uuid())
    returning id into v_aid;
    insert into public.period_approval_lines (approval_id, organization_id, person_id, display_name, production_count, production_minor, rule_kind,
           percent, earned_minor, advances_minor, payments_minor, approved_minor, excess_minor)
    select v_aid, v_org, (y ->> 'person_id')::uuid, y ->> 'display_name', (y -> 'production' ->> 'count')::int, (y -> 'production' ->> 'total_minor')::bigint,
           y -> 'rule' ->> 'kind', (y -> 'rule' ->> 'percent')::numeric, (y ->> 'earned_minor')::bigint, (y -> 'advances' ->> 'total_minor')::bigint,
           (y -> 'payments' ->> 'total_minor')::bigint, (y ->> 'remaining_minor')::bigint, (y ->> 'excess_minor')::bigint
      from jsonb_array_elements(v_pos -> 'people') y;
    update public.periods set state = 'pronto_para_pagamento', review_revision = review_revision + 1 where id = v_pid returning * into v_p;
    insert into public.period_transitions (organization_id, period_id, from_state, to_state, actor_person_id, at, review_revision)
    values (v_org, v_pid, 'aberto', 'pronto_para_pagamento', v_mgr, v_at + interval '7 days', v_p.review_revision);
    v_lines := private.approval_payments(private.current_approval(v_pid));
    update public.periods set state = 'fechado', review_revision = review_revision + 1 where id = v_pid returning * into v_p;
    insert into public.period_transitions (organization_id, period_id, from_state, to_state, actor_person_id, at, review_revision)
    values (v_org, v_pid, 'pronto_para_pagamento', 'fechado', v_mgr, v_at + interval '8 days', v_p.review_revision);
    insert into public.period_close_statements (organization_id, period_id, closed_by_person_id, closed_at, review_revision, calculation_version, statement, command_id)
    values (v_org, v_pid, v_mgr, v_at + interval '8 days', v_p.review_revision, private.calculation_version(), jsonb_build_object(
        'position', private.period_position(v_org, v_p),
        'approval', jsonb_build_object('id', v_aid, 'lines', v_lines,
                      'total_minor', (select sum((l ->> 'approved_minor')::bigint) from jsonb_array_elements(v_lines) l), 'paid_minor', 0, 'payments_count', 0),
        'reserve', jsonb_build_object('allocated_minor', 0, 'used_minor', 0, 'balance_minor', 0),
        'owners_decision_recorded', false), gen_random_uuid());
  end loop;
end $$;
