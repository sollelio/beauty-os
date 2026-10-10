-- Business Health Slice 05 (Negócio → Finanças). Synthetic, not pilot data.
-- "Teste Finanças F" (code TEST-ORG-F-2026), used by tests/db/business_finance and the browser smoke.
--   77a1, 77a2 professionals A, B (standing 40%) · 77a3 C (30% for F1 only; a later 90% rule changes F1's live figures,
--   not its close statement) · 77a5 manager PIN 717171 · 77a6 business.health.read only PIN 727272 · 77a7 none PIN 737373
-- Eight 7-day periods from 2025-09-01. Figures in Kz:
--         production  team    Materiais Renda  purchases → result  reserve alloc/used  owners'  Livre  Não distr.  paid / unpaid
--   F1    210.000     83.000  10.000    30.000 10.000    → 77.000  20.000 / —          30.000   57.000 27.000      83.000 / 0      fechado
--   F2    200.000     80.000  12.000    30.000 12.000    → 66.000  10.000 / —          none     56.000 56.000      80.000 / 0      fechado
--   F3    200.000     80.000  11.000    30.000 10.000    → 69.000  — / 5.000 (Renda)   50.000   74.000 24.000      80.000 / 0      fechado
--   F4    220.000     88.000  18.000    30.000 23.000    → 61.000  10.000 / —          30.000   51.000 21.000      88.000 / 0      fechado
--         (+ a cancelled service of 30.000 and a cancelled Materiais expense of 50.000, both excluded)
--   F5    200.000     80.000  10.000    30.000 —         → 80.000  —                   —        80.000 —           50.000 / 30.000 em_pagamento (only B owed)
--   F6    100.000 (A only)     —         30.000 —         → 30.000                                                              aberto
--   F7    100.000     40.000  —         30.000 —         → 30.000  A advanced 50.000 > earned 20.000 (only A above earnings) aberto
--   F8    nothing recorded                                                                                                    aberto
-- Reserve balance: 20.000 + 10.000 + 10.000 − 5.000 = 35.000.
insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values
  ('00000000-0000-4000-8000-0000000000f4', 'Teste Finanças F', 'Africa/Luanda', 'AOA', 2, 'Kz') on conflict (id) do nothing;
insert into private.enrollment_codes (code_hash, organization_id, label, expires_at, max_uses) values
  (encode(extensions.digest('TEST-ORG-F-2026', 'sha256'), 'hex'), '00000000-0000-4000-8000-0000000000f4', 'Test device F', '2027-12-31', 100000) on conflict (code_hash) do nothing;
insert into public.payment_methods (id, organization_id, code, label, sort_order) values ('00000000-0000-4000-8000-0000000077a0', '00000000-0000-4000-8000-0000000000f4', 'numerario', 'Numerário', 1) on conflict (id) do nothing;
insert into public.services (id, organization_id, name, default_price_minor, sort_order) values ('00000000-0000-4000-8000-0000000077b1', '00000000-0000-4000-8000-0000000000f4', 'Serviço Teste F', 1000000, 1) on conflict (id) do nothing;
insert into public.expense_categories (id, organization_id, label, sort_order) values
  ('00000000-0000-4000-8000-0000000077c1', '00000000-0000-4000-8000-0000000000f4', 'Materiais', 1), ('00000000-0000-4000-8000-0000000077c2', '00000000-0000-4000-8000-0000000000f4', 'Renda', 2) on conflict (id) do nothing;
insert into public.purchase_origins (id, organization_id, label, sort_order) values ('00000000-0000-4000-8000-0000000077d1', '00000000-0000-4000-8000-0000000000f4', 'Loja Teste F', 1) on conflict (id) do nothing;
insert into public.unit_words (organization_id, word, sort_order) values ('00000000-0000-4000-8000-0000000000f4', 'unid.', 1) on conflict do nothing;
insert into public.products (id, organization_id, name, unit_word) values ('00000000-0000-4000-8000-0000000077e1', '00000000-0000-4000-8000-0000000000f4', 'Produto Teste F', 'unid.') on conflict do nothing;
insert into public.people (id, organization_id, display_name) values
  ('00000000-0000-4000-8000-0000000077a1', '00000000-0000-4000-8000-0000000000f4', 'Profissional F-A'), ('00000000-0000-4000-8000-0000000077a2', '00000000-0000-4000-8000-0000000000f4', 'Profissional F-B'),
  ('00000000-0000-4000-8000-0000000077a3', '00000000-0000-4000-8000-0000000000f4', 'Profissional F-C'), ('00000000-0000-4000-8000-0000000077a5', '00000000-0000-4000-8000-0000000000f4', 'Gestor Teste F'),
  ('00000000-0000-4000-8000-0000000077a6', '00000000-0000-4000-8000-0000000000f4', 'Sócio Negócio F'), ('00000000-0000-4000-8000-0000000077a7', '00000000-0000-4000-8000-0000000000f4', 'Sem Permissões F') on conflict (id) do nothing;
insert into private.person_secrets (person_id, organization_id, secret_hash) values
  ('00000000-0000-4000-8000-0000000077a5', '00000000-0000-4000-8000-0000000000f4', extensions.crypt('717171', extensions.gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-0000000077a6', '00000000-0000-4000-8000-0000000000f4', extensions.crypt('727272', extensions.gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-0000000077a7', '00000000-0000-4000-8000-0000000000f4', extensions.crypt('737373', extensions.gen_salt('bf', 8))) on conflict (person_id) do nothing;
insert into private.person_permissions (organization_id, person_id, permission)
select '00000000-0000-4000-8000-0000000000f4'::uuid, '00000000-0000-4000-8000-0000000077a5'::uuid, perm
  from (values ('team.finance.read'), ('business.health.read'), ('movement.confirm'), ('period.decide'), ('payment.confirm'),
               ('period.close'), ('records.correct')) x(perm)
union all select '00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000077a6', 'business.health.read'
on conflict do nothing;
insert into public.rule_versions (organization_id, person_id, kind, percent, effective_from, set_by_person_id, set_at)
select '00000000-0000-4000-8000-0000000000f4', r.p::uuid, 'standing', r.pct, '2000-01-01', '00000000-0000-4000-8000-0000000077a5', '2000-01-01 09:00+01'
  from (values ('00000000-0000-4000-8000-0000000077a1', 40), ('00000000-0000-4000-8000-0000000077a2', 40), ('00000000-0000-4000-8000-0000000077a3', 30)) r(p, pct)
 where not exists (select 1 from public.rule_versions rv where rv.person_id = r.p::uuid);

do $$
declare
  v_org uuid := '00000000-0000-4000-8000-0000000000f4'; v_mgr uuid := '00000000-0000-4000-8000-0000000077a5'; v_dev uuid := '00000000-0000-4000-8000-00000007aede';
  v_cash uuid := '00000000-0000-4000-8000-0000000077a0'; v_svc uuid := '00000000-0000-4000-8000-0000000077b1'; v_ori uuid := '00000000-0000-4000-8000-0000000077d1';
  v_a uuid := '00000000-0000-4000-8000-0000000077a1'; v_b uuid := '00000000-0000-4000-8000-0000000077a2'; v_c uuid := '00000000-0000-4000-8000-0000000077a3';
  v_mat uuid := '00000000-0000-4000-8000-0000000077c1'; v_renda uuid := '00000000-0000-4000-8000-0000000077c2';
  -- per period: services of A, B, C (10.000 each); Materiais, Renda, salon purchase; reserve allocated; reserve used on
  -- Renda; owners' decision (null none, 0 'none', > 0 amount); state: 3 closed, 2 em_pagamento (B paid 10.000), 0 aberto;
  -- advance to A
  v_spec jsonb := '[
    {"a": 10, "b": 10, "c": 1, "mat": 1000000, "renda": 3000000, "pur": 1000000, "alloc": 2000000, "use": 0,      "dec": 3000000, "state": 3},
    {"a": 10, "b": 10, "c": 0, "mat": 1200000, "renda": 3000000, "pur": 1200000, "alloc": 1000000, "use": 0,      "dec": 0,       "state": 3},
    {"a": 10, "b": 10, "c": 0, "mat": 1100000, "renda": 3000000, "pur": 1000000, "alloc": 0,       "use": 500000, "dec": 5000000, "state": 3},
    {"a": 12, "b": 10, "c": 0, "mat": 1800000, "renda": 3000000, "pur": 2300000, "alloc": 1000000, "use": 0,      "dec": 3000000, "state": 3, "cancelled": true},
    {"a": 10, "b": 10, "c": 0, "mat": 1000000, "renda": 3000000, "pur": 0,       "alloc": 0,       "use": 0,      "dec": null,    "state": 2},
    {"a": 10, "b": 0,  "c": 0, "mat": 0,       "renda": 3000000, "pur": 0,       "alloc": 0,       "use": 0,      "dec": null,    "state": 0},
    {"a": 5,  "b": 5,  "c": 0, "mat": 0,       "renda": 3000000, "pur": 0,       "alloc": 0,       "use": 0,      "dec": null,    "state": 0, "adv": 5000000},
    {"a": 0,  "b": 0,  "c": 0, "mat": 0,       "renda": 0,       "pur": 0,       "alloc": 0,       "use": 0,      "dec": null,    "state": 0}]';
  s jsonb; v_n int; i int; v_start date; v_pid uuid; v_at timestamptz; v_rec uuid; v_e uuid; v_renda_id uuid; v_pur uuid; v_p public.periods;
  v_pos jsonb; v_aid uuid; v_lines jsonb; x jsonb; p uuid;
begin
  for v_n in 1..8 loop
    v_start := date '2025-09-01' + (v_n - 1) * 7;
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'Semana F' || v_n, v_start, v_start + 6)
    on conflict do nothing returning id into v_pid;
    if v_pid is null then continue; end if;
    s := v_spec -> (v_n - 1);
    v_at := (v_start::text || ' 12:00+01')::timestamptz;
    for p, i in select y.p, generate_series(1, y.n) from (values (v_a, (s ->> 'a')::int), (v_b, (s ->> 'b')::int), (v_c, (s ->> 'c')::int)) y(p, n) loop
      insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, recorded_at, device_id, command_id)
      values (v_org, p, v_svc, 1000000, 'single', v_at, v_at, v_dev, gen_random_uuid()) returning id into v_rec;
      insert into public.service_record_payments values (v_rec, v_org, v_cash, 1000000);
    end loop;
    if (s ->> 'mat')::bigint > 0 then
      insert into public.expenses (organization_id, category_id, amount_minor, payment_kind, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id)
      values (v_org, v_mat, (s ->> 'mat')::bigint, 'single', v_at, v_at, v_dev, v_mgr, gen_random_uuid()) returning id into v_e;
      insert into public.expense_payments values (v_e, v_org, v_cash, (s ->> 'mat')::bigint);
    end if;
    if (s ->> 'renda')::bigint > 0 then
      insert into public.expenses (organization_id, category_id, amount_minor, payment_kind, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id)
      values (v_org, v_renda, (s ->> 'renda')::bigint, 'single', v_at, v_at, v_dev, v_mgr, gen_random_uuid()) returning id into v_renda_id;
      insert into public.expense_payments values (v_renda_id, v_org, v_cash, (s ->> 'renda')::bigint);
    end if;
    if (s ->> 'pur')::bigint > 0 then
      insert into public.purchases (organization_id, total_minor, origin_id, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id)
      values (v_org, (s ->> 'pur')::bigint, v_ori, v_at, v_at, v_dev, v_mgr, gen_random_uuid()) returning id into v_pur;
      insert into public.purchase_lines (purchase_id, organization_id, product_id, quantity, unit_word, line_cost_minor, position)
      values (v_pur, v_org, '00000000-0000-4000-8000-0000000077e1', 1, 'unid.', (s ->> 'pur')::bigint, 1);
      insert into public.purchase_contributions (purchase_id, organization_id, contributor_kind, person_id, amount_minor) values (v_pur, v_org, 'salon', null, (s ->> 'pur')::bigint);
    end if;
    if s ? 'cancelled' then                              -- recorded by mistake and cancelled while the period was open
      insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, recorded_at, device_id, command_id)
      values (v_org, v_a, v_svc, 3000000, 'single', v_at, v_at, v_dev, gen_random_uuid()) returning id into v_rec;
      insert into public.service_record_payments values (v_rec, v_org, v_cash, 3000000);
      insert into public.record_cancellations (organization_id, record_kind, record_id, period_id, reason, cancelled_by_person_id, command_id)
      values (v_org, 'service', v_rec, v_pid, 'Registo de teste anulado', v_mgr, gen_random_uuid());
      insert into public.expenses (organization_id, category_id, amount_minor, payment_kind, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id)
      values (v_org, v_mat, 5000000, 'single', v_at, v_at, v_dev, v_mgr, gen_random_uuid()) returning id into v_e;
      insert into public.expense_payments values (v_e, v_org, v_cash, 5000000);
      insert into public.record_cancellations (organization_id, record_kind, record_id, period_id, reason, cancelled_by_person_id, command_id)
      values (v_org, 'expense', v_e, v_pid, 'Registo de teste anulado', v_mgr, gen_random_uuid());
    end if;
    if s ? 'adv' then
      insert into public.advances (organization_id, person_id, amount_minor, payment_method_id, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id)
      values (v_org, v_a, (s ->> 'adv')::bigint, v_cash, v_at, v_at, v_dev, v_mgr, gen_random_uuid());
    end if;
    if (s ->> 'alloc')::bigint > 0 then
      insert into public.reserve_allocations (organization_id, period_id, amount_minor, note, confirmed_by_person_id, occurred_at, command_id)
      values (v_org, v_pid, (s ->> 'alloc')::bigint, 'Reserva teste', v_mgr, v_at + interval '7 days', gen_random_uuid());
    end if;
    if (s ->> 'use')::bigint > 0 then
      insert into public.reserve_uses (organization_id, period_id, expense_id, amount_minor, confirmed_by_person_id, occurred_at, command_id)
      values (v_org, v_pid, v_renda_id, (s ->> 'use')::bigint, v_mgr, v_at + interval '7 days', gen_random_uuid());
    end if;
    if s ->> 'dec' is not null then
      insert into public.owners_decisions (organization_id, period_id, kind, amount_minor, decided_by_person_id, decided_at, command_id)
      values (v_org, v_pid, case when (s ->> 'dec')::bigint > 0 then 'amount' else 'none' end, nullif((s ->> 'dec')::bigint, 0), v_mgr, v_at + interval '7 days', gen_random_uuid());
    end if;
    if (s ->> 'state')::int < 2 then continue; end if;

    -- approve (as approve_period does), then pay (as confirm_payment does), then close (as close_period does)
    select * into v_p from public.periods where id = v_pid;
    v_pos := private.period_position(v_org, v_p);
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
    for x in select y from jsonb_array_elements(private.approval_payments(private.current_approval(v_pid))) y where (y ->> 'approved_minor')::bigint > 0 loop
      if (s ->> 'state')::int = 2 and (x ->> 'person_id')::uuid = v_b then
        insert into public.payments (organization_id, period_id, person_id, amount_minor, payment_method_id, paid_at, confirmed_by_person_id, command_id, approval_id)
        values (v_org, v_pid, v_b, 1000000, v_cash, v_at + interval '8 days', v_mgr, gen_random_uuid(), v_aid);
      else
        insert into public.payments (organization_id, period_id, person_id, amount_minor, payment_method_id, paid_at, confirmed_by_person_id, command_id, approval_id)
        values (v_org, v_pid, (x ->> 'person_id')::uuid, (x ->> 'approved_minor')::bigint, v_cash, v_at + interval '8 days', v_mgr, gen_random_uuid(), v_aid);
      end if;
    end loop;
    update public.periods set state = 'em_pagamento', review_revision = review_revision + 1 where id = v_pid returning * into v_p;
    insert into public.period_transitions (organization_id, period_id, from_state, to_state, actor_person_id, at, review_revision)
    values (v_org, v_pid, 'pronto_para_pagamento', 'em_pagamento', v_mgr, v_at + interval '8 days', v_p.review_revision);
    if (s ->> 'state')::int = 2 then continue; end if;
    v_lines := private.approval_payments(private.current_approval(v_pid));
    v_pos := private.period_position(v_org, v_p);
    update public.periods set state = 'fechado', review_revision = review_revision + 1 where id = v_pid returning * into v_p;
    insert into public.period_transitions (organization_id, period_id, from_state, to_state, actor_person_id, at, review_revision)
    values (v_org, v_pid, 'em_pagamento', 'fechado', v_mgr, v_at + interval '9 days', v_p.review_revision);
    insert into public.period_close_statements (organization_id, period_id, closed_by_person_id, closed_at, review_revision, calculation_version, statement, command_id)
    values (v_org, v_pid, v_mgr, v_at + interval '9 days', v_p.review_revision, private.calculation_version(), jsonb_build_object(
        'position', v_pos,
        'approval', jsonb_build_object('id', v_aid, 'lines', v_lines,
                      'total_minor', (select sum((l ->> 'approved_minor')::bigint) from jsonb_array_elements(v_lines) l),
                      'paid_minor', (select sum((l ->> 'paid_minor')::bigint) from jsonb_array_elements(v_lines) l),
                      'payments_count', (select count(*) from public.payments y where y.approval_id = v_aid)),
        'reserve', jsonb_build_object('allocated_minor', v_pos -> 'reserve_allocated_minor', 'used_minor', v_pos -> 'reserve_used_minor',
                                      'balance_minor', private.reserve_balance(v_org)),
        'owners_decision_recorded', v_pos -> 'owners_decision' <> 'null'::jsonb), gen_random_uuid());
  end loop;
end $$;

-- After F1 closed, C's rule changes back to 2025-08-01 (90%): F1's live figures would change, its statement must not.
insert into public.rule_versions (organization_id, person_id, kind, percent, effective_from, set_by_person_id, set_at)
select '00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000077a3', 'standing', 90, '2025-08-01', '00000000-0000-4000-8000-0000000077a5', '2025-10-01 09:00+01'
 where not exists (select 1 from public.rule_versions where person_id = '00000000-0000-4000-8000-0000000077a3' and percent = 90);
