-- More one-day "Ciclo Teste" periods in test organization A for tests/db/slice06 (and corrections), which consume them
-- (lifecycle tests leave periods approved, decided or allocated; 07_slice06.sql seeded 1–60). Same records as there:
-- n = 61–160, 2001-03-02 … 2001-06-09. Synthetic, idempotent (an existing period is skipped).
do $$
declare
  v_org uuid := '00000000-0000-4000-8000-0000000000a1'; v_conf uuid := '00000000-0000-4000-8000-00000000a202';
  v_dev uuid := '00000000-0000-4000-8000-0000000caede'; v_cash uuid := '00000000-0000-4000-8000-00000000a101';
  v_svc uuid := '00000000-0000-4000-8000-00000000a301';
  v_day date; v_pid uuid; v_at timestamptz; v_rec uuid; v_pur uuid; v_exp uuid; n int; person uuid; amt bigint;
begin
  for n in 61..160 loop
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
