-- Slice 06 synthetic development data. Not pilot data.
-- 1. Permissions for the Fecho boundaries (B5 period.decide · B6 payment.confirm · B7 period.close).
-- 2. Salão Demo: Agosto (fechado) and Setembro (em pagamento) were seeded in Slice 04 before approvals existed;
--    backfill their contextual decision, approval outputs, payment links, transitions and Agosto's close statement.
-- 3. Test organization A: a pool of one-day "Ciclo Teste" periods with identical records for tests/db/slice06
--    (lifecycle tests consume periods: there is no reopen while 07 I3 is open).
-- 4. "Salão Fecho (Dev)" (enrollment code DEV-FECHO-2026): the Slice 06 §10 sample (Nádia, Laurindo, Carla, Fernando ·
--    sócio, Mercy) in Outubro and two identical spare periods, for the browser smoke test. PINs: Mercy 135790,
--    Fernando 246810.

-- 1 ---------------------------------------------------------------------------------------------------------------
insert into private.person_permissions (organization_id, person_id, permission)
select o, p, perm from (values
  ('00000000-0000-4000-8000-000000000d01'::uuid, '00000000-0000-4000-8000-00000000d204'::uuid),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a202'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a204'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000b202')) v(o, p)
cross join (values ('period.decide'), ('payment.confirm'), ('period.close')) x(perm)
on conflict do nothing;

-- 2 ---------------------------------------------------------------------------------------------------------------
do $$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000d01'; v_duarte uuid := '00000000-0000-4000-8000-00000000d204';
  v_bruno uuid := '00000000-0000-4000-8000-00000000d202';
  v_pid uuid; v_p public.periods; v_pos jsonb; v_aid uuid; v_at timestamptz; v_first timestamptz; v_lines jsonb;
begin
  foreach v_pid in array array['00000000-0000-4000-8000-0000000cd801'::uuid, '00000000-0000-4000-8000-0000000cd802'] loop
    select * into v_p from public.periods where id = v_pid;
    if exists (select 1 from public.period_approvals where period_id = v_pid) then continue; end if;
    v_at := (v_p.ends_on::text || ' 18:00+01')::timestamptz;
    insert into public.period_rule_decisions (organization_id, period_id, person_id, percent, decided_by_person_id, decided_at, command_id)
    values (v_org, v_pid, v_bruno, 40, v_duarte, v_at - interval '1 hour', gen_random_uuid());
    v_pos := private.period_position(v_org, v_p);
    -- approved before any payment: approved = max(earned − advances, 0)
    insert into public.period_approvals (organization_id, period_id, approved_by_person_id, approved_at, review_revision, calculation_version, totals, cases, command_id)
    values (v_org, v_pid, v_duarte, v_at, v_p.review_revision, private.calculation_version(),
            (v_pos - 'people') || jsonb_build_object('payable_minor', (select sum(greatest((x ->> 'earned_minor')::bigint - (x -> 'advances' ->> 'total_minor')::bigint, 0)) from jsonb_array_elements(v_pos -> 'people') x)),
            coalesce((select jsonb_agg(jsonb_build_object('kind', 'above_earned', 'person_id', x ->> 'person_id', 'display_name', x ->> 'display_name',
                       'earned_minor', (x ->> 'earned_minor')::bigint, 'advances_minor', (x -> 'advances' ->> 'total_minor')::bigint,
                       'excess_minor', (x -> 'advances' ->> 'total_minor')::bigint - (x ->> 'earned_minor')::bigint))
                       from jsonb_array_elements(v_pos -> 'people') x where (x -> 'advances' ->> 'total_minor')::bigint > (x ->> 'earned_minor')::bigint), '[]'::jsonb),
            gen_random_uuid())
    returning id into v_aid;
    insert into public.period_approval_lines (approval_id, organization_id, person_id, display_name, production_count, production_minor, rule_kind,
           percent, earned_minor, advances_minor, payments_minor, approved_minor, excess_minor)
    select v_aid, v_org, (x ->> 'person_id')::uuid, x ->> 'display_name', (x -> 'production' ->> 'count')::int, (x -> 'production' ->> 'total_minor')::bigint,
           x -> 'rule' ->> 'kind', (x -> 'rule' ->> 'percent')::numeric, (x ->> 'earned_minor')::bigint, (x -> 'advances' ->> 'total_minor')::bigint, 0,
           greatest((x ->> 'earned_minor')::bigint - (x -> 'advances' ->> 'total_minor')::bigint, 0),
           greatest((x -> 'advances' ->> 'total_minor')::bigint - (x ->> 'earned_minor')::bigint, 0)
      from jsonb_array_elements(v_pos -> 'people') x;
    update public.payments set approval_id = v_aid where period_id = v_pid and approval_id is null;
    select min(paid_at) into v_first from public.payments where period_id = v_pid;
    insert into public.period_transitions (organization_id, period_id, from_state, to_state, actor_person_id, at, review_revision)
    values (v_org, v_pid, 'aberto', 'pronto_para_pagamento', v_duarte, v_at, v_p.review_revision);
    if v_first is not null then
      insert into public.period_transitions (organization_id, period_id, from_state, to_state, actor_person_id, at, review_revision)
      values (v_org, v_pid, 'pronto_para_pagamento', 'em_pagamento', v_duarte, v_first, v_p.review_revision);
    end if;
    if v_p.state = 'fechado' then
      v_lines := private.approval_payments(private.current_approval(v_pid));
      insert into public.period_transitions (organization_id, period_id, from_state, to_state, actor_person_id, at, review_revision)
      values (v_org, v_pid, 'em_pagamento', 'fechado', v_duarte, v_first + interval '1 day', v_p.review_revision);
      insert into public.period_close_statements (organization_id, period_id, closed_by_person_id, closed_at, review_revision, calculation_version, statement, command_id)
      values (v_org, v_pid, v_duarte, v_first + interval '1 day', v_p.review_revision, private.calculation_version(), jsonb_build_object(
          'position', private.period_position(v_org, v_p),
          'approval', jsonb_build_object('id', v_aid, 'lines', v_lines,
                        'total_minor', (select sum((l ->> 'approved_minor')::bigint) from jsonb_array_elements(v_lines) l),
                        'paid_minor', (select sum((l ->> 'paid_minor')::bigint) from jsonb_array_elements(v_lines) l),
                        'payments_count', (select count(*) from public.payments where approval_id = v_aid)),
          'reserve', jsonb_build_object('allocated_minor', 0, 'used_minor', 0, 'balance_minor', 0),
          'owners_decision_recorded', false), gen_random_uuid());
    end if;
  end loop;
end $$;

-- 3 ---------------------------------------------------------------------------------------------------------------
insert into public.rule_versions (organization_id, person_id, kind, percent, effective_from, set_by_person_id, set_at) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a201', 'standing',   40,   '2000-01-01', '00000000-0000-4000-8000-00000000a205', '2000-01-01 09:00+01'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a206', 'contextual', null, '2000-01-01', '00000000-0000-4000-8000-00000000a205', '2000-01-01 09:00+01'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a207', 'standing',   50,   '2000-01-01', '00000000-0000-4000-8000-00000000a205', '2000-01-01 09:00+01')
on conflict do nothing;

do $$
declare
  v_org uuid := '00000000-0000-4000-8000-0000000000a1'; v_conf uuid := '00000000-0000-4000-8000-00000000a202';
  v_dev uuid := '00000000-0000-4000-8000-0000000caede'; v_cash uuid := '00000000-0000-4000-8000-00000000a101';
  v_svc uuid := '00000000-0000-4000-8000-00000000a301';
  v_day date; v_pid uuid; v_at timestamptz; v_rec uuid; v_pur uuid; v_exp uuid; n int; person uuid; amt bigint;
begin
  for n in 1..60 loop
    v_day := date '2001-01-01' + (n - 1);
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'Ciclo Teste ' || lpad(n::text, 2, '0'), v_day, v_day)
    on conflict do nothing returning id into v_pid;
    if v_pid is null then continue; end if;
    v_at := (v_day::text || ' 12:00+01')::timestamptz;
    -- services: a201 3 × 10.000 · a207 2 × 10.000 · a206 1 × 15.000
    for person, amt in select * from (values ('00000000-0000-4000-8000-00000000a201'::uuid, 1000000::bigint), ('00000000-0000-4000-8000-00000000a201', 1000000),
                                             ('00000000-0000-4000-8000-00000000a201', 1000000), ('00000000-0000-4000-8000-00000000a207', 1000000),
                                             ('00000000-0000-4000-8000-00000000a207', 1000000), ('00000000-0000-4000-8000-00000000a206', 1500000)) s loop
      insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, recorded_at, device_id, command_id)
      values (v_org, person, v_svc, amt, 'single', v_at, v_at, v_dev, gen_random_uuid()) returning id into v_rec;
      insert into public.service_record_payments (service_record_id, organization_id, payment_method_id, amount_minor) values (v_rec, v_org, v_cash, amt);
    end loop;
    -- advances: a201 2.000 · a207 12.000 (excess 2.000) · a206 3.000
    insert into public.advances (organization_id, person_id, amount_minor, payment_method_id, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id)
    values (v_org, '00000000-0000-4000-8000-00000000a201', 200000, v_cash, v_at, v_at, v_dev, v_conf, gen_random_uuid()),
           (v_org, '00000000-0000-4000-8000-00000000a207', 1200000, v_cash, v_at, v_at, v_dev, v_conf, gen_random_uuid()),
           (v_org, '00000000-0000-4000-8000-00000000a206', 300000, v_cash, v_at, v_at, v_dev, v_conf, gen_random_uuid());
    -- expense 5.000 · purchase 3.000 (salon 2.000 + a201 1.000)
    insert into public.expenses (organization_id, category_id, amount_minor, payment_kind, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id)
    values (v_org, '00000000-0000-4000-8000-00000000a401', 500000, 'single', v_at, v_at, v_dev, v_conf, gen_random_uuid()) returning id into v_exp;
    insert into public.expense_payments (expense_id, organization_id, payment_method_id, amount_minor) values (v_exp, v_org, v_cash, 500000);
    insert into public.purchases (organization_id, total_minor, origin_id, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id)
    values (v_org, 300000, '00000000-0000-4000-8000-00000000a501', v_at, v_at, v_dev, v_conf, gen_random_uuid()) returning id into v_pur;
    insert into public.purchase_lines (purchase_id, organization_id, product_id, quantity, unit_word, line_cost_minor, position)
    values (v_pur, v_org, '00000000-0000-4000-8000-00000000a601', 1, 'unid.', 300000, 1);
    insert into public.purchase_contributions (purchase_id, organization_id, contributor_kind, person_id, amount_minor)
    values (v_pur, v_org, 'salon', null, 200000), (v_pur, v_org, 'person', '00000000-0000-4000-8000-00000000a201', 100000);
  end loop;
end $$;

-- 4 ---------------------------------------------------------------------------------------------------------------
insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values
  ('00000000-0000-4000-8000-000000000f01', 'Salão Fecho (Dev)', 'Africa/Luanda', 'AOA', 2, 'Kz')
on conflict (id) do nothing;
insert into private.enrollment_codes (code_hash, organization_id, label, expires_at, max_uses) values
  (encode(extensions.digest('DEV-FECHO-2026', 'sha256'), 'hex'), '00000000-0000-4000-8000-000000000f01', 'Dev Fecho device', '2027-12-31', 200)
on conflict (code_hash) do nothing;
insert into public.payment_methods (id, organization_id, code, label, sort_order) values
  ('00000000-0000-4000-8000-00000000f101', '00000000-0000-4000-8000-000000000f01', 'numerario', 'Numerário', 1),
  ('00000000-0000-4000-8000-00000000f102', '00000000-0000-4000-8000-000000000f01', 'transferencia', 'Transferência', 2)
on conflict (id) do nothing;
insert into public.people (id, organization_id, display_name) values
  ('00000000-0000-4000-8000-00000000f201', '00000000-0000-4000-8000-000000000f01', 'Nádia'),
  ('00000000-0000-4000-8000-00000000f202', '00000000-0000-4000-8000-000000000f01', 'Laurindo'),
  ('00000000-0000-4000-8000-00000000f203', '00000000-0000-4000-8000-000000000f01', 'Carla'),
  ('00000000-0000-4000-8000-00000000f204', '00000000-0000-4000-8000-000000000f01', 'Fernando'),
  ('00000000-0000-4000-8000-00000000f205', '00000000-0000-4000-8000-000000000f01', 'Mercy')
on conflict (id) do nothing;
insert into public.person_capabilities (organization_id, person_id, label, sort_order) values
  ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-00000000f201', 'Cabelo', 1),
  ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-00000000f201', 'Unhas', 2),
  ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-00000000f202', 'Barbearia', 1),
  ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-00000000f203', 'Cabelo', 1),
  ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-00000000f204', 'Unhas', 1),
  ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-00000000f204', 'Barbearia', 2)
on conflict do nothing;
insert into public.person_ownerships (organization_id, person_id) values ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-00000000f204')
on conflict do nothing;
insert into private.person_secrets (person_id, organization_id, secret_hash) values
  ('00000000-0000-4000-8000-00000000f205', '00000000-0000-4000-8000-000000000f01', extensions.crypt('135790', extensions.gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-00000000f204', '00000000-0000-4000-8000-000000000f01', extensions.crypt('246810', extensions.gen_salt('bf', 8)))
on conflict (person_id) do nothing;
insert into private.person_permissions (organization_id, person_id, permission)
select '00000000-0000-4000-8000-000000000f01', p, perm from (values
  ('00000000-0000-4000-8000-00000000f205'::uuid, 'team.finance.read'), ('00000000-0000-4000-8000-00000000f205', 'movement.confirm'),
  ('00000000-0000-4000-8000-00000000f205', 'period.decide'), ('00000000-0000-4000-8000-00000000f205', 'payment.confirm'),
  ('00000000-0000-4000-8000-00000000f205', 'period.close'),
  ('00000000-0000-4000-8000-00000000f204', 'team.finance.read'), ('00000000-0000-4000-8000-00000000f204', 'period.decide')) v(p, perm)
on conflict do nothing;
insert into public.services (id, organization_id, name, default_price_minor, sort_order) values
  ('00000000-0000-4000-8000-00000000f301', '00000000-0000-4000-8000-000000000f01', 'Manicure em gel', 650000, 1),
  ('00000000-0000-4000-8000-00000000f302', '00000000-0000-4000-8000-000000000f01', 'Barba', 250000, 2),
  ('00000000-0000-4000-8000-00000000f303', '00000000-0000-4000-8000-000000000f01', 'Coloração', 700000, 3),
  ('00000000-0000-4000-8000-00000000f304', '00000000-0000-4000-8000-000000000f01', 'Corte', 400000, 4)
on conflict (id) do nothing;
insert into public.expense_categories (id, organization_id, label, hint, sort_order) values
  ('00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-000000000f01', 'Electricidade', null, 1),
  ('00000000-0000-4000-8000-00000000f402', '00000000-0000-4000-8000-000000000f01', 'Água', null, 2),
  ('00000000-0000-4000-8000-00000000f403', '00000000-0000-4000-8000-000000000f01', 'Manutenção', null, 3),
  ('00000000-0000-4000-8000-00000000f404', '00000000-0000-4000-8000-000000000f01', 'Outros', null, 4)
on conflict (id) do nothing;
insert into public.purchase_origins (id, organization_id, label, sort_order) values
  ('00000000-0000-4000-8000-00000000f501', '00000000-0000-4000-8000-000000000f01', 'Mercado', 1),
  ('00000000-0000-4000-8000-00000000f502', '00000000-0000-4000-8000-000000000f01', 'Loja local', 2)
on conflict (id) do nothing;
insert into public.unit_words (organization_id, word, sort_order) values ('00000000-0000-4000-8000-000000000f01', 'unid.', 1), ('00000000-0000-4000-8000-000000000f01', 'frasco', 2)
on conflict do nothing;
insert into public.products (id, organization_id, name, unit_word) values
  ('00000000-0000-4000-8000-00000000f601', '00000000-0000-4000-8000-000000000f01', 'Shampoo 5 L', 'unid.'),
  ('00000000-0000-4000-8000-00000000f602', '00000000-0000-4000-8000-000000000f01', 'Gel para unhas', 'frasco'),
  ('00000000-0000-4000-8000-00000000f603', '00000000-0000-4000-8000-000000000f01', 'Cera depilatória', 'unid.'),
  ('00000000-0000-4000-8000-00000000f604', '00000000-0000-4000-8000-000000000f01', 'Lâminas', 'unid.')
on conflict do nothing;
insert into public.rule_versions (organization_id, person_id, kind, percent, effective_from, set_by_person_id, set_at) values
  ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-00000000f201', 'standing',   70,   '2026-01-01', '00000000-0000-4000-8000-00000000f205', '2026-10-01 09:00+01'),
  ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-00000000f202', 'standing',   50,   '2026-01-01', '00000000-0000-4000-8000-00000000f205', '2026-10-01 09:00+01'),
  ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-00000000f203', 'contextual', null, '2026-01-01', '00000000-0000-4000-8000-00000000f205', '2026-01-01 09:00+01'),
  ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-00000000f204', 'contextual', null, '2026-01-01', '00000000-0000-4000-8000-00000000f205', '2026-01-01 09:00+01')
on conflict do nothing;

-- The sample month, three times: Outubro (current) and two identical spares (Setembro, Agosto).
do $$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000f01'; v_mercy uuid := '00000000-0000-4000-8000-00000000f205';
  v_dev uuid := '00000000-0000-4000-8000-0000000cfede'; v_cash uuid := '00000000-0000-4000-8000-00000000f101'; v_tr uuid := '00000000-0000-4000-8000-00000000f102';
  m record; v_pid uuid; v_rec uuid; v_pur uuid; v_exp uuid; i int; t timestamptz;
begin
  for m in select * from (values ('Outubro', date '2026-10-01', date '2026-10-31'), ('Setembro', date '2026-09-01', date '2026-09-30'),
                                 ('Agosto', date '2026-08-01', date '2026-08-31')) x(label, s, e) loop
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, m.label, m.s, m.e)
    on conflict do nothing returning id into v_pid;
    if v_pid is null then continue; end if;
    -- services: (person, service, count, unit value, last value) totals 100.000 · 58.000 · 64.000 · 78.000
    for i in 1..15 loop
      t := (m.s + ((i - 1) % 28))::timestamp + interval '10 hours' + (i || ' minutes')::interval;
      insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, recorded_at, device_id, command_id)
      values (v_org, '00000000-0000-4000-8000-00000000f201', '00000000-0000-4000-8000-00000000f301', case when i = 15 then 900000 else 650000 end, 'single', t, t, v_dev, gen_random_uuid())
      returning id into v_rec;
      insert into public.service_record_payments values (v_rec, v_org, v_tr, case when i = 15 then 900000 else 650000 end);
    end loop;
    for i in 1..22 loop
      t := (m.s + ((i - 1) % 28))::timestamp + interval '11 hours' + (i || ' minutes')::interval;
      insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, recorded_at, device_id, command_id)
      values (v_org, '00000000-0000-4000-8000-00000000f202', '00000000-0000-4000-8000-00000000f302', case when i = 22 then 550000 else 250000 end, 'single', t, t, v_dev, gen_random_uuid())
      returning id into v_rec;
      insert into public.service_record_payments values (v_rec, v_org, v_cash, case when i = 22 then 550000 else 250000 end);
    end loop;
    for i in 1..9 loop
      t := (m.s + ((i - 1) * 3 % 28))::timestamp + interval '14 hours' + (i || ' minutes')::interval;
      insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, recorded_at, device_id, command_id)
      values (v_org, '00000000-0000-4000-8000-00000000f203', '00000000-0000-4000-8000-00000000f303', case when i = 9 then 800000 else 700000 end, 'single', t, t, v_dev, gen_random_uuid())
      returning id into v_rec;
      insert into public.service_record_payments values (v_rec, v_org, v_cash, case when i = 9 then 800000 else 700000 end);
    end loop;
    for i in 1..18 loop
      t := (m.s + ((i - 1) % 28))::timestamp + interval '16 hours' + (i || ' minutes')::interval;
      insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, recorded_at, device_id, command_id)
      values (v_org, '00000000-0000-4000-8000-00000000f204', '00000000-0000-4000-8000-00000000f304', case when i = 18 then 1000000 else 400000 end, 'single', t, t, v_dev, gen_random_uuid())
      returning id into v_rec;
      insert into public.service_record_payments values (v_rec, v_org, v_tr, case when i = 18 then 1000000 else 400000 end);
    end loop;
    -- advances: Nádia 10.000 + 15.000 · Laurindo 20.000 + 15.000 · Carla 10.000
    insert into public.advances (organization_id, person_id, amount_minor, payment_method_id, note, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id) values
      (v_org, '00000000-0000-4000-8000-00000000f201', 1000000, v_cash, null, m.s + 4 + time '17:10', m.s + 4 + time '17:10', v_dev, v_mercy, gen_random_uuid()),
      (v_org, '00000000-0000-4000-8000-00000000f201', 1500000, v_tr, 'pedido no dia 17', m.s + 17 + time '17:05', m.s + 17 + time '17:05', v_dev, v_mercy, gen_random_uuid()),
      (v_org, '00000000-0000-4000-8000-00000000f202', 2000000, v_cash, null, m.s + 6 + time '17:00', m.s + 6 + time '17:00', v_dev, v_mercy, gen_random_uuid()),
      (v_org, '00000000-0000-4000-8000-00000000f202', 1500000, v_cash, null, m.s + 20 + time '17:00', m.s + 20 + time '17:00', v_dev, v_mercy, gen_random_uuid()),
      (v_org, '00000000-0000-4000-8000-00000000f203', 1000000, v_cash, null, m.s + 9 + time '17:30', m.s + 9 + time '17:30', v_dev, v_mercy, gen_random_uuid());
    -- expenses 23.500
    for i, t in select * from (values (1, m.s + 2 + time '09:00'), (2, m.s + 7 + time '09:00'), (3, m.s + 14 + time '09:00'), (4, m.s + 21 + time '09:00')) z loop
      insert into public.expenses (organization_id, category_id, amount_minor, payment_kind, note, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id)
      values (v_org, ('00000000-0000-4000-8000-00000000f40' || i)::uuid, (array[900000, 650000, 500000, 300000])[i], 'single',
              case when i = 4 then 'indemnização a cliente' end, t, t, v_dev, v_mercy, gen_random_uuid()) returning id into v_exp;
      insert into public.expense_payments values (v_exp, v_org, case when i = 1 then v_tr else v_cash end, (array[900000, 650000, 500000, 300000])[i]);
    end loop;
    -- purchases: Mercado 23.500 (Salão 15.000 + Nádia 8.500, 3 products) · Loja local 5.500 (Salão)
    t := m.s + 11 + time '13:05';
    insert into public.purchases (organization_id, total_minor, origin_id, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id)
    values (v_org, 2350000, '00000000-0000-4000-8000-00000000f501', t, t, v_dev, v_mercy, gen_random_uuid()) returning id into v_pur;
    insert into public.purchase_lines (purchase_id, organization_id, product_id, quantity, unit_word, line_cost_minor, position) values
      (v_pur, v_org, '00000000-0000-4000-8000-00000000f601', 2, 'unid.', 1400000, 1),
      (v_pur, v_org, '00000000-0000-4000-8000-00000000f602', 3, 'frasco', 750000, 2),
      (v_pur, v_org, '00000000-0000-4000-8000-00000000f603', 2, 'unid.', 200000, 3);
    insert into public.purchase_contributions (purchase_id, organization_id, contributor_kind, person_id, amount_minor) values
      (v_pur, v_org, 'salon', null, 1500000), (v_pur, v_org, 'person', '00000000-0000-4000-8000-00000000f201', 850000);
    t := m.s + 23 + time '12:00';
    insert into public.purchases (organization_id, total_minor, origin_id, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id)
    values (v_org, 550000, '00000000-0000-4000-8000-00000000f502', t, t, v_dev, v_mercy, gen_random_uuid()) returning id into v_pur;
    insert into public.purchase_lines (purchase_id, organization_id, product_id, quantity, unit_word, line_cost_minor, position)
    values (v_pur, v_org, '00000000-0000-4000-8000-00000000f604', 1, 'unid.', 550000, 1);
    insert into public.purchase_contributions (purchase_id, organization_id, contributor_kind, person_id, amount_minor) values (v_pur, v_org, 'salon', null, 550000);
    -- reserve allocation 20.000 (D1)
    insert into public.reserve_allocations (organization_id, period_id, amount_minor, note, confirmed_by_person_id, occurred_at, command_id)
    values (v_org, v_pid, 2000000, 'manutenção e imprevistos', v_mercy, m.s + 14 + time '10:00', gen_random_uuid());
  end loop;
end $$;
