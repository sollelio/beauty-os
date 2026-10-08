-- Business Health Slice 01. Synthetic, not pilot data.
-- 1. Dev demo (Salão Fecho): business.health.read for Fernando and Mercy.
-- 2. "Teste Negócio E" (code TEST-ORG-E-2026), used by tests/db/business_health and the browser smoke.
--    Seven 7-day periods in 2025 (E1–E5 closed, E6 approved with 30.000 unpaid, E7 ended and open with a pending
--    rule) and E8, a long period containing "today". People:
--      e201 professional, standing 40%             e202 manager: team.finance.read + business.health.read + Fecho, PIN 515151
--      e203 business.health.read only, PIN 525252  e204 no permissions, PIN 535353
--      e205 contextual rule from E7 (pending)      e206 standing 30% (only in E2; a later 90% rule changes E2's live
--                                                   figures but not its close statement)
--    Per period (Kz): production · team · expenses X/Y/Z · salon purchases → operating result
--      E1      0 ·      0 · X 1.000                  →  −1.000
--      E2 100.000 · 39.000 · X 5.000 Z 1.000         →  55.000
--      E3  80.000 · 32.000 · X 5.000 Z 1.000         →  42.000   (8 services)
--      E4 100.000 · 40.000 · X 6.000 Y 1.000 Z 1.000 →  52.000
--      E5 120.000 · 48.000 · X 20.000 Y 2.000 Z 1.500 · purchases 10.000 → 38.500
--         (+ a cancelled service of 50.000 and a cancelled X expense of 100.000, both excluded)
--      E6  90.000 · 36.000 · X 5.000                 →  49.000   (10 services; approved, 30.000 unpaid)
--      E7  70.000 · pending (e205 contextual)        →  —
insert into private.person_permissions (organization_id, person_id, permission) values
  ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-00000000f204', 'business.health.read'),
  ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-00000000f205', 'business.health.read')
on conflict do nothing;

insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values
  ('00000000-0000-4000-8000-0000000000e1', 'Teste Negócio E', 'Africa/Luanda', 'AOA', 2, 'Kz') on conflict (id) do nothing;
insert into private.enrollment_codes (code_hash, organization_id, label, expires_at, max_uses) values
  (encode(extensions.digest('TEST-ORG-E-2026', 'sha256'), 'hex'), '00000000-0000-4000-8000-0000000000e1', 'Test device E', '2027-12-31', 100000)
on conflict (code_hash) do nothing;
insert into public.payment_methods (id, organization_id, code, label, sort_order) values
  ('00000000-0000-4000-8000-00000000e101', '00000000-0000-4000-8000-0000000000e1', 'numerario', 'Numerário', 1) on conflict (id) do nothing;
insert into public.people (id, organization_id, display_name) values
  ('00000000-0000-4000-8000-00000000e201', '00000000-0000-4000-8000-0000000000e1', 'Profissional Teste E'),
  ('00000000-0000-4000-8000-00000000e202', '00000000-0000-4000-8000-0000000000e1', 'Gestor Teste E'),
  ('00000000-0000-4000-8000-00000000e203', '00000000-0000-4000-8000-0000000000e1', 'Sócio Negócio E'),
  ('00000000-0000-4000-8000-00000000e204', '00000000-0000-4000-8000-0000000000e1', 'Sem Permissões E'),
  ('00000000-0000-4000-8000-00000000e205', '00000000-0000-4000-8000-0000000000e1', 'Contextual Teste E'),
  ('00000000-0000-4000-8000-00000000e206', '00000000-0000-4000-8000-0000000000e1', 'Regra Tardia E')
on conflict (id) do nothing;
insert into private.person_secrets (person_id, organization_id, secret_hash) values
  ('00000000-0000-4000-8000-00000000e202', '00000000-0000-4000-8000-0000000000e1', extensions.crypt('515151', extensions.gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-00000000e203', '00000000-0000-4000-8000-0000000000e1', extensions.crypt('525252', extensions.gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-00000000e204', '00000000-0000-4000-8000-0000000000e1', extensions.crypt('535353', extensions.gen_salt('bf', 8)))
on conflict (person_id) do nothing;
insert into private.person_permissions (organization_id, person_id, permission)
select '00000000-0000-4000-8000-0000000000e1'::uuid, '00000000-0000-4000-8000-00000000e202'::uuid, perm
  from (values ('team.finance.read'), ('business.health.read'), ('movement.confirm'), ('period.decide'), ('payment.confirm'),
               ('period.close'), ('records.correct')) x(perm)
union all select '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000e203', 'business.health.read'
on conflict do nothing;
insert into public.services (id, organization_id, name, default_price_minor, sort_order) values
  ('00000000-0000-4000-8000-00000000e301', '00000000-0000-4000-8000-0000000000e1', 'Serviço Teste E', 1000000, 1) on conflict (id) do nothing;
insert into public.expense_categories (id, organization_id, label, sort_order) values
  ('00000000-0000-4000-8000-00000000e401', '00000000-0000-4000-8000-0000000000e1', 'Categoria X', 1),
  ('00000000-0000-4000-8000-00000000e402', '00000000-0000-4000-8000-0000000000e1', 'Categoria Y', 2),
  ('00000000-0000-4000-8000-00000000e403', '00000000-0000-4000-8000-0000000000e1', 'Categoria Z', 3)
on conflict (id) do nothing;
insert into public.purchase_origins (id, organization_id, label, sort_order) values
  ('00000000-0000-4000-8000-00000000e501', '00000000-0000-4000-8000-0000000000e1', 'Origem Teste E', 1) on conflict (id) do nothing;
insert into public.unit_words (organization_id, word, sort_order) values ('00000000-0000-4000-8000-0000000000e1', 'unid.', 1) on conflict do nothing;
insert into public.products (id, organization_id, name, unit_word) values
  ('00000000-0000-4000-8000-00000000e601', '00000000-0000-4000-8000-0000000000e1', 'Produto Teste E', 'unid.') on conflict do nothing;
insert into public.rule_versions (organization_id, person_id, kind, percent, effective_from, set_by_person_id, set_at) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000e201', 'standing', 40, '2000-01-01', '00000000-0000-4000-8000-00000000e202', '2000-01-01 09:00+01'),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000e206', 'standing', 30, '2025-01-01', '00000000-0000-4000-8000-00000000e202', '2025-01-01 09:00+01'),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000e205', 'contextual', null, '2025-02-17', '00000000-0000-4000-8000-00000000e202', '2025-02-17 09:00+01')
on conflict do nothing;

do $$
declare
  v_org uuid := '00000000-0000-4000-8000-0000000000e1'; v_mgr uuid := '00000000-0000-4000-8000-00000000e202';
  v_dev uuid := '00000000-0000-4000-8000-0000000eaede'; v_cash uuid := '00000000-0000-4000-8000-00000000e101';
  v_svc uuid := '00000000-0000-4000-8000-00000000e301'; v_p201 uuid := '00000000-0000-4000-8000-00000000e201';
  v_x uuid := '00000000-0000-4000-8000-00000000e401'; v_y uuid := '00000000-0000-4000-8000-00000000e402'; v_z uuid := '00000000-0000-4000-8000-00000000e403';
  v_n int; v_start date; v_pid uuid; v_at timestamptz; v_rec uuid; v_exp uuid; v_pur uuid; v_p public.periods; v_pos jsonb; v_aid uuid; v_lines jsonb;
  -- per period: services of e201 (count, value), e206 services, e205 services, e201 advance, expenses X/Y/Z, salon purchase
  v_spec jsonb := '[
    {"n": 0,  "v": 1000000, "e206": 0, "e205": 0, "adv": 0,       "x": 100000,  "y": 0,      "z": 0},
    {"n": 9,  "v": 1000000, "e206": 1, "e205": 0, "adv": 3600000, "x": 500000,  "y": 0,      "z": 100000},
    {"n": 8,  "v": 1000000, "e206": 0, "e205": 0, "adv": 3200000, "x": 500000,  "y": 0,      "z": 100000},
    {"n": 10, "v": 1000000, "e206": 0, "e205": 0, "adv": 4000000, "x": 600000,  "y": 100000, "z": 100000},
    {"n": 12, "v": 1000000, "e206": 0, "e205": 0, "adv": 4800000, "x": 2000000, "y": 200000, "z": 150000, "purchase": 1200000, "contrib": 200000, "cancelled": true},
    {"n": 10, "v": 900000,  "e206": 0, "e205": 0, "adv": 600000,  "x": 500000,  "y": 0,      "z": 0},
    {"n": 5,  "v": 1000000, "e206": 0, "e205": 2, "adv": 0,       "x": 0,       "y": 0,      "z": 0}]';
  s jsonb; i int; cat uuid; amt bigint;
begin
  for v_n in 1..7 loop
    v_start := date '2025-01-06' + (v_n - 1) * 7;
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'Semana E' || v_n, v_start, v_start + 6)
    on conflict do nothing returning id into v_pid;
    if v_pid is null then continue; end if;
    s := v_spec -> (v_n - 1);
    v_at := (v_start::text || ' 12:00+01')::timestamptz;
    for i in 1..(s ->> 'n')::int + (s ->> 'e206')::int + (s ->> 'e205')::int loop
      insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, recorded_at, device_id, command_id)
      values (v_org, case when i <= (s ->> 'n')::int then v_p201 when i <= (s ->> 'n')::int + (s ->> 'e206')::int then '00000000-0000-4000-8000-00000000e206'::uuid
                          else '00000000-0000-4000-8000-00000000e205'::uuid end,
              v_svc, (s ->> 'v')::bigint, 'single', v_at, v_at, v_dev, gen_random_uuid()) returning id into v_rec;
      insert into public.service_record_payments values (v_rec, v_org, v_cash, (s ->> 'v')::bigint);
    end loop;
    if (s ->> 'adv')::bigint > 0 then
      insert into public.advances (organization_id, person_id, amount_minor, payment_method_id, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id)
      values (v_org, v_p201, (s ->> 'adv')::bigint, v_cash, v_at, v_at, v_dev, v_mgr, gen_random_uuid());
    end if;
    if (s ->> 'e206')::int > 0 then                      -- e206 earned 30% × 10.000, advanced in full: nothing to pay
      insert into public.advances (organization_id, person_id, amount_minor, payment_method_id, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id)
      values (v_org, '00000000-0000-4000-8000-00000000e206', 300000, v_cash, v_at, v_at, v_dev, v_mgr, gen_random_uuid());
    end if;
    for cat, amt in select * from (values (v_x, (s ->> 'x')::bigint), (v_y, (s ->> 'y')::bigint), (v_z, (s ->> 'z')::bigint)) e where e.column2 > 0 loop
      insert into public.expenses (organization_id, category_id, amount_minor, payment_kind, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id)
      values (v_org, cat, amt, 'single', v_at, v_at, v_dev, v_mgr, gen_random_uuid()) returning id into v_exp;
      insert into public.expense_payments values (v_exp, v_org, v_cash, amt);
    end loop;
    if s ? 'purchase' then
      insert into public.purchases (organization_id, total_minor, origin_id, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id)
      values (v_org, (s ->> 'purchase')::bigint, '00000000-0000-4000-8000-00000000e501', v_at, v_at, v_dev, v_mgr, gen_random_uuid()) returning id into v_pur;
      insert into public.purchase_lines (purchase_id, organization_id, product_id, quantity, unit_word, line_cost_minor, position)
      values (v_pur, v_org, '00000000-0000-4000-8000-00000000e601', 1, 'unid.', (s ->> 'purchase')::bigint, 1);
      insert into public.purchase_contributions (purchase_id, organization_id, contributor_kind, person_id, amount_minor)
      values (v_pur, v_org, 'salon', null, (s ->> 'purchase')::bigint - (s ->> 'contrib')::bigint), (v_pur, v_org, 'person', v_p201, (s ->> 'contrib')::bigint);
    end if;
    if s ? 'cancelled' then                              -- recorded by mistake and cancelled while the period was open
      insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, recorded_at, device_id, command_id)
      values (v_org, v_p201, v_svc, 5000000, 'single', v_at, v_at, v_dev, gen_random_uuid()) returning id into v_rec;
      insert into public.service_record_payments values (v_rec, v_org, v_cash, 5000000);
      insert into public.record_cancellations (organization_id, record_kind, record_id, period_id, reason, cancelled_by_person_id, command_id)
      values (v_org, 'service', v_rec, v_pid, 'Registo de teste anulado', v_mgr, gen_random_uuid());
      insert into public.expenses (organization_id, category_id, amount_minor, payment_kind, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id)
      values (v_org, v_x, 10000000, 'single', v_at, v_at, v_dev, v_mgr, gen_random_uuid()) returning id into v_exp;
      insert into public.expense_payments values (v_exp, v_org, v_cash, 10000000);
      insert into public.record_cancellations (organization_id, record_kind, record_id, period_id, reason, cancelled_by_person_id, command_id)
      values (v_org, 'expense', v_exp, v_pid, 'Registo de teste anulado', v_mgr, gen_random_uuid());
    end if;

    if v_n <= 6 then                                     -- approve (as approve_period does)
      select * into v_p from public.periods where id = v_pid;
      v_pos := private.period_position(v_org, v_p);
      insert into public.period_approvals (organization_id, period_id, approved_by_person_id, approved_at, review_revision, calculation_version, totals, cases, command_id)
      values (v_org, v_pid, v_mgr, v_at + interval '7 days', v_p.review_revision, private.calculation_version(), v_pos - 'people', '[]'::jsonb, gen_random_uuid())
      returning id into v_aid;
      insert into public.period_approval_lines (approval_id, organization_id, person_id, display_name, production_count, production_minor, rule_kind,
             percent, earned_minor, advances_minor, payments_minor, approved_minor, excess_minor)
      select v_aid, v_org, (x ->> 'person_id')::uuid, x ->> 'display_name', (x -> 'production' ->> 'count')::int, (x -> 'production' ->> 'total_minor')::bigint,
             x -> 'rule' ->> 'kind', (x -> 'rule' ->> 'percent')::numeric, (x ->> 'earned_minor')::bigint, (x -> 'advances' ->> 'total_minor')::bigint,
             (x -> 'payments' ->> 'total_minor')::bigint, (x ->> 'remaining_minor')::bigint, (x ->> 'excess_minor')::bigint
        from jsonb_array_elements(v_pos -> 'people') x;
      update public.periods set state = 'pronto_para_pagamento', review_revision = review_revision + 1 where id = v_pid returning * into v_p;
      insert into public.period_transitions (organization_id, period_id, from_state, to_state, actor_person_id, at, review_revision)
      values (v_org, v_pid, 'aberto', 'pronto_para_pagamento', v_mgr, v_at + interval '7 days', v_p.review_revision);
    end if;
    if v_n <= 5 then                                     -- close (as close_period does; nothing was left to pay)
      v_lines := private.approval_payments(private.current_approval(v_pid));
      update public.periods set state = 'fechado', review_revision = review_revision + 1 where id = v_pid returning * into v_p;
      insert into public.period_transitions (organization_id, period_id, from_state, to_state, actor_person_id, at, review_revision)
      values (v_org, v_pid, 'pronto_para_pagamento', 'fechado', v_mgr, v_at + interval '8 days', v_p.review_revision);
      insert into public.period_close_statements (organization_id, period_id, closed_by_person_id, closed_at, review_revision, calculation_version, statement, command_id)
      values (v_org, v_pid, v_mgr, v_at + interval '8 days', v_p.review_revision, private.calculation_version(), jsonb_build_object(
          'position', private.period_position(v_org, v_p),
          'approval', jsonb_build_object('id', v_aid, 'lines', v_lines,
                        'total_minor', (select sum((l ->> 'approved_minor')::bigint) from jsonb_array_elements(v_lines) l),
                        'paid_minor', 0, 'payments_count', 0),
          'reserve', jsonb_build_object('allocated_minor', 0, 'used_minor', 0, 'balance_minor', 0),
          'owners_decision_recorded', false), gen_random_uuid());
    end if;
  end loop;
end $$;

-- After E2 closed, e206's rule changes back to 2025-01-02 (90%): E2's live figures would change, its statement must not.
insert into public.rule_versions (organization_id, person_id, kind, percent, effective_from, set_by_person_id, set_at)
select '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000e206', 'standing', 90, '2025-01-02', '00000000-0000-4000-8000-00000000e202', '2025-03-01 09:00+01'
 where not exists (select 1 from public.rule_versions where person_id = '00000000-0000-4000-8000-00000000e206' and percent = 90);

insert into public.periods (organization_id, label, starts_on, ends_on)
values ('00000000-0000-4000-8000-0000000000e1', 'Actual E8', '2026-10-01', '2027-12-31') on conflict do nothing;
