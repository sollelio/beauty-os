-- Business Health Slice 04 (Negócio → Custos & Stock). Synthetic, not pilot data.
-- "Teste Custos K" (code TEST-ORG-K-2026), used by tests/db/business_costs and the browser smoke.
--   66a1–66a2 professionals A, B (standing 40%) · 66a5 manager PIN 818181 · 66a6 business.health.read only PIN 828282
--   66a7 no permissions PIN 838383
-- Four closed 7-day periods from 2025-07-07, production 200.000 each; K5 (2025-08-04) open with nothing recorded.
--   Expenses (Kz)   Materiais   Renda   Luz        Salon-funded purchases
--   K1               10.000     30.000  5.000      —
--   K2               12.000     30.000  5.000      —
--   K3               11.000     30.000  6.000      10.000  (Acetona 6.000 + Algodão 4.000)
--   K4               18.000     30.000  7.000      23.000  (Acetona 3 × 6.000; Luvas 8.000 of which A paid 3.000)
--   K4 also has a cancelled Materiais expense (50.000) and a cancelled Acetona purchase (6.000).
--   Stock marks (baixo/comprar) in K3–K4: Acetona 3, Algodão 3, Luvas 1. Now: Acetona comprar · on list · urgent; Algodão baixo.
insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values
  ('00000000-0000-4000-8000-0000000000f3', 'Teste Custos K', 'Africa/Luanda', 'AOA', 2, 'Kz') on conflict (id) do nothing;
insert into private.enrollment_codes (code_hash, organization_id, label, expires_at, max_uses) values
  (encode(extensions.digest('TEST-ORG-K-2026', 'sha256'), 'hex'), '00000000-0000-4000-8000-0000000000f3', 'Test device K', '2027-12-31', 100000) on conflict (code_hash) do nothing;
insert into public.payment_methods (id, organization_id, code, label, sort_order) values ('00000000-0000-4000-8000-0000000066a0', '00000000-0000-4000-8000-0000000000f3', 'numerario', 'Numerário', 1) on conflict (id) do nothing;
insert into public.services (id, organization_id, name, default_price_minor, sort_order) values ('00000000-0000-4000-8000-0000000066b1', '00000000-0000-4000-8000-0000000000f3', 'Serviço Teste K', 1000000, 1) on conflict (id) do nothing;
insert into public.expense_categories (id, organization_id, label, sort_order) values
  ('00000000-0000-4000-8000-0000000066c1', '00000000-0000-4000-8000-0000000000f3', 'Materiais', 1), ('00000000-0000-4000-8000-0000000066c2', '00000000-0000-4000-8000-0000000000f3', 'Renda', 2), ('00000000-0000-4000-8000-0000000066c3', '00000000-0000-4000-8000-0000000000f3', 'Luz', 3) on conflict (id) do nothing;
insert into public.purchase_origins (id, organization_id, label, sort_order) values ('00000000-0000-4000-8000-0000000066d1', '00000000-0000-4000-8000-0000000000f3', 'Loja Teste K', 1) on conflict (id) do nothing;
insert into public.unit_words (organization_id, word, sort_order) values ('00000000-0000-4000-8000-0000000000f3', 'unid.', 1) on conflict do nothing;
insert into public.products (id, organization_id, name, unit_word) values
  ('00000000-0000-4000-8000-0000000066e1', '00000000-0000-4000-8000-0000000000f3', 'Acetona', 'unid.'), ('00000000-0000-4000-8000-0000000066e2', '00000000-0000-4000-8000-0000000000f3', 'Algodão', 'unid.'), ('00000000-0000-4000-8000-0000000066e3', '00000000-0000-4000-8000-0000000000f3', 'Luvas', 'unid.') on conflict do nothing;
insert into public.people (id, organization_id, display_name) values
  ('00000000-0000-4000-8000-0000000066a1', '00000000-0000-4000-8000-0000000000f3', 'Profissional K-A'), ('00000000-0000-4000-8000-0000000066a2', '00000000-0000-4000-8000-0000000000f3', 'Profissional K-B'), ('00000000-0000-4000-8000-0000000066a5', '00000000-0000-4000-8000-0000000000f3', 'Gestor Teste K'),
  ('00000000-0000-4000-8000-0000000066a6', '00000000-0000-4000-8000-0000000000f3', 'Sócio Negócio K'), ('00000000-0000-4000-8000-0000000066a7', '00000000-0000-4000-8000-0000000000f3', 'Sem Permissões K') on conflict (id) do nothing;
insert into private.person_secrets (person_id, organization_id, secret_hash) values
  ('00000000-0000-4000-8000-0000000066a5', '00000000-0000-4000-8000-0000000000f3', extensions.crypt('818181', extensions.gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-0000000066a6', '00000000-0000-4000-8000-0000000000f3', extensions.crypt('828282', extensions.gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-0000000066a7', '00000000-0000-4000-8000-0000000000f3', extensions.crypt('838383', extensions.gen_salt('bf', 8))) on conflict (person_id) do nothing;
insert into private.person_permissions (organization_id, person_id, permission)
select '00000000-0000-4000-8000-0000000000f3'::uuid, '00000000-0000-4000-8000-0000000066a5'::uuid, perm
  from (values ('team.finance.read'), ('business.health.read'), ('movement.confirm'), ('period.decide'), ('payment.confirm'),
               ('period.close'), ('records.correct')) x(perm)
union all select '00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000066a6', 'business.health.read'
on conflict do nothing;
insert into public.rule_versions (organization_id, person_id, kind, percent, effective_from, set_by_person_id, set_at)
select '00000000-0000-4000-8000-0000000000f3', p::uuid, 'standing', 40, '2000-01-01', '00000000-0000-4000-8000-0000000066a5', '2000-01-01 09:00+01' from (values ('00000000-0000-4000-8000-0000000066a1'), ('00000000-0000-4000-8000-0000000066a2')) r(p)
 where not exists (select 1 from public.rule_versions rv where rv.person_id = r.p::uuid);

do $$
declare
  v_org uuid := '00000000-0000-4000-8000-0000000000f3'; v_mgr uuid := '00000000-0000-4000-8000-0000000066a5'; v_dev uuid := '00000000-0000-4000-8000-00000006aede'; v_cash uuid := '00000000-0000-4000-8000-0000000066a0';
  v_svc uuid := '00000000-0000-4000-8000-0000000066b1'; v_ori uuid := '00000000-0000-4000-8000-0000000066d1'; v_acet uuid := '00000000-0000-4000-8000-0000000066e1'; v_alg uuid := '00000000-0000-4000-8000-0000000066e2'; v_luv uuid := '00000000-0000-4000-8000-0000000066e3';
  v_exp jsonb := '[[1000000, 3000000, 500000], [1200000, 3000000, 500000], [1100000, 3000000, 600000], [1800000, 3000000, 700000]]';
  v_n int; i int; j int; v_start date; v_pid uuid; v_at timestamptz; v_rec uuid; v_e uuid; v_pur uuid; v_p public.periods; v_pos jsonb; v_aid uuid; v_lines jsonb; x jsonb;
begin
  for v_n in 1..4 loop
    v_start := date '2025-07-07' + (v_n - 1) * 7;
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'Semana K' || v_n, v_start, v_start + 6)
    on conflict do nothing returning id into v_pid;
    if v_pid is null then continue; end if;
    v_at := (v_start::text || ' 12:00+01')::timestamptz;
    for i in 1..20 loop
      insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, recorded_at, device_id, command_id)
      values (v_org, case when i <= 10 then '00000000-0000-4000-8000-0000000066a1'::uuid else '00000000-0000-4000-8000-0000000066a2'::uuid end, v_svc, 1000000, 'single', v_at, v_at, v_dev, gen_random_uuid()) returning id into v_rec;
      insert into public.service_record_payments values (v_rec, v_org, v_cash, 1000000);
    end loop;
    for j in 1..3 loop
      insert into public.expenses (organization_id, category_id, amount_minor, payment_kind, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id)
      values (v_org, ('00000000-0000-4000-8000-0000000066c' || j)::uuid, (v_exp -> (v_n - 1) ->> (j - 1))::bigint, 'single', v_at, v_at, v_dev, v_mgr, gen_random_uuid()) returning id into v_e;
      insert into public.expense_payments values (v_e, v_org, v_cash, (v_exp -> (v_n - 1) ->> (j - 1))::bigint);
    end loop;
    if v_n = 3 then
      insert into public.purchases (organization_id, total_minor, origin_id, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id)
      values (v_org, 1000000, v_ori, v_at + interval '2 days', v_at + interval '2 days', v_dev, v_mgr, gen_random_uuid()) returning id into v_pur;
      insert into public.purchase_lines (purchase_id, organization_id, product_id, quantity, unit_word, line_cost_minor, position)
      values (v_pur, v_org, v_acet, 1, 'unid.', 600000, 1), (v_pur, v_org, v_alg, 2, 'unid.', 400000, 2);
      insert into public.purchase_contributions (purchase_id, organization_id, contributor_kind, person_id, amount_minor) values (v_pur, v_org, 'salon', null, 1000000);
    end if;
    if v_n = 4 then
      for i in 0..3 loop                                      -- Acetona three times (the fourth is cancelled)
        insert into public.purchases (organization_id, total_minor, origin_id, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id)
        values (v_org, 600000, v_ori, v_at + i * interval '1 day', v_at + i * interval '1 day', v_dev, v_mgr, gen_random_uuid()) returning id into v_pur;
        insert into public.purchase_lines (purchase_id, organization_id, product_id, quantity, unit_word, line_cost_minor, position) values (v_pur, v_org, v_acet, 1, 'unid.', 600000, 1);
        insert into public.purchase_contributions (purchase_id, organization_id, contributor_kind, person_id, amount_minor) values (v_pur, v_org, 'salon', null, 600000);
        if i = 3 then
          insert into public.record_cancellations (organization_id, record_kind, record_id, period_id, reason, cancelled_by_person_id, command_id)
          values (v_org, 'purchase', v_pur, v_pid, 'Registo de teste anulado', v_mgr, gen_random_uuid());
        end if;
      end loop;
      insert into public.purchases (organization_id, total_minor, origin_id, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id)
      values (v_org, 800000, v_ori, v_at + interval '5 days', v_at + interval '5 days', v_dev, v_mgr, gen_random_uuid()) returning id into v_pur;
      insert into public.purchase_lines (purchase_id, organization_id, product_id, quantity, unit_word, line_cost_minor, position) values (v_pur, v_org, v_luv, 2, 'unid.', 800000, 1);
      insert into public.purchase_contributions (purchase_id, organization_id, contributor_kind, person_id, amount_minor)
      values (v_pur, v_org, 'salon', null, 500000), (v_pur, v_org, 'person', '00000000-0000-4000-8000-0000000066a1', 300000);
      insert into public.expenses (organization_id, category_id, amount_minor, payment_kind, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id)
      values (v_org, '00000000-0000-4000-8000-0000000066c1', 5000000, 'single', v_at, v_at, v_dev, v_mgr, gen_random_uuid()) returning id into v_e;
      insert into public.expense_payments values (v_e, v_org, v_cash, 5000000);
      insert into public.record_cancellations (organization_id, record_kind, record_id, period_id, reason, cancelled_by_person_id, command_id)
      values (v_org, 'expense', v_e, v_pid, 'Registo de teste anulado', v_mgr, gen_random_uuid());
    end if;

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

  -- Stock Lite: the marks of K3–K4 and the state now (only once)
  if not exists (select 1 from public.product_state_changes where organization_id = v_org) then
    insert into public.product_state_changes (organization_id, product_id, changed_at, device_id, from_state, to_state, to_reserve)
    select v_org, x.p, (x.d::text || ' 10:00+01')::timestamptz, v_dev, x.f, x.t, 0
      from (values (v_acet, date '2025-07-22', 'ok', 'comprar'), (v_acet, date '2025-07-25', 'comprar', 'ok'), (v_acet, date '2025-07-29', 'ok', 'baixo'),
                   (v_acet, date '2025-07-31', 'baixo', 'comprar'),
                   (v_alg, date '2025-07-21', 'ok', 'baixo'), (v_alg, date '2025-07-24', 'baixo', 'ok'), (v_alg, date '2025-07-28', 'ok', 'baixo'),
                   (v_alg, date '2025-07-30', 'baixo', 'ok'), (v_alg, date '2025-08-02', 'ok', 'baixo'),
                   (v_luv, date '2025-07-28', 'ok', 'comprar'), (v_luv, date '2025-07-30', 'comprar', 'ok')) x(p, d, f, t);
    update public.products set state = 'comprar', on_list = true, urgent = true, planned_qty = 2 where id = v_acet;
    update public.products set state = 'baixo' where id = v_alg;
  end if;
end $$;

-- K5: ended, open, nothing recorded (zero production and zero expenses).
insert into public.periods (organization_id, label, starts_on, ends_on) values ('00000000-0000-4000-8000-0000000000f3', 'Semana K5', '2025-08-04', '2025-08-10') on conflict do nothing;
