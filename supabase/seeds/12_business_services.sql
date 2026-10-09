-- Business Health Slice 03 (Negócio → Serviços). Synthetic, not pilot data.
-- "Teste Serviços S" (code TEST-ORG-S-2026), used by tests/db/business_services and the browser smoke.
--   55a1–55a4 professionals A–D (standing 40%; each period's earnings advanced in full)
--   55a5 manager: team.finance.read + business.health.read, PIN 717171 · 55a6 business.health.read only, PIN 727272
--   55a7 no permissions, PIN 737373
-- Services: Corte 5.000 · Cor 20.000 · Manicure 4.000 · Pedicure 5.000 · Alongamento 10.000 · Penteado 8.000 (only B).
-- Four closed 7-day periods from 2025-05-05 (count per service; who performed them in the spec below):
--          Corte  Cor  Manicure  Pedicure  Alongamento  Penteado   total
--   S1      10     2      4         —          —           —       106.000   (3 services)
--   S2      20     4      6         5         10           1       337.000
--   S3      20     5      5         7          8           2       351.000   (two services 57%)
--   S4      30     4      6         9          6           4       391.000   (Corte 38%; + a cancelled Cor)
--   Pedicure 5 → 7 → 9 grows twice; Alongamento 10 → 8 → 6 falls twice; Penteado 1 → 2 → 4 on too small a base.
insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values
  ('00000000-0000-4000-8000-0000000000f2', 'Teste Serviços S', 'Africa/Luanda', 'AOA', 2, 'Kz') on conflict (id) do nothing;
insert into private.enrollment_codes (code_hash, organization_id, label, expires_at, max_uses) values
  (encode(extensions.digest('TEST-ORG-S-2026', 'sha256'), 'hex'), '00000000-0000-4000-8000-0000000000f2', 'Test device S', '2027-12-31', 100000)
on conflict (code_hash) do nothing;
insert into public.payment_methods (id, organization_id, code, label, sort_order) values
  ('00000000-0000-4000-8000-0000000055a0', '00000000-0000-4000-8000-0000000000f2', 'numerario', 'Numerário', 1) on conflict (id) do nothing;
insert into public.services (id, organization_id, name, default_price_minor, sort_order) values
  ('00000000-0000-4000-8000-0000000055b1', '00000000-0000-4000-8000-0000000000f2', 'Corte', 500000, 1),
  ('00000000-0000-4000-8000-0000000055b2', '00000000-0000-4000-8000-0000000000f2', 'Cor', 2000000, 2),
  ('00000000-0000-4000-8000-0000000055b3', '00000000-0000-4000-8000-0000000000f2', 'Manicure', 400000, 3),
  ('00000000-0000-4000-8000-0000000055b4', '00000000-0000-4000-8000-0000000000f2', 'Pedicure', 500000, 4),
  ('00000000-0000-4000-8000-0000000055b5', '00000000-0000-4000-8000-0000000000f2', 'Alongamento', 1000000, 5),
  ('00000000-0000-4000-8000-0000000055b6', '00000000-0000-4000-8000-0000000000f2', 'Penteado', 800000, 6)
on conflict (id) do nothing;
insert into public.people (id, organization_id, display_name) values
  ('00000000-0000-4000-8000-0000000055a1', '00000000-0000-4000-8000-0000000000f2', 'Profissional S-A'),
  ('00000000-0000-4000-8000-0000000055a2', '00000000-0000-4000-8000-0000000000f2', 'Profissional S-B'),
  ('00000000-0000-4000-8000-0000000055a3', '00000000-0000-4000-8000-0000000000f2', 'Profissional S-C'),
  ('00000000-0000-4000-8000-0000000055a4', '00000000-0000-4000-8000-0000000000f2', 'Profissional S-D'),
  ('00000000-0000-4000-8000-0000000055a5', '00000000-0000-4000-8000-0000000000f2', 'Gestor Teste S'),
  ('00000000-0000-4000-8000-0000000055a6', '00000000-0000-4000-8000-0000000000f2', 'Sócio Negócio S'),
  ('00000000-0000-4000-8000-0000000055a7', '00000000-0000-4000-8000-0000000000f2', 'Sem Permissões S')
on conflict (id) do nothing;
insert into private.person_secrets (person_id, organization_id, secret_hash) values
  ('00000000-0000-4000-8000-0000000055a5', '00000000-0000-4000-8000-0000000000f2', extensions.crypt('717171', extensions.gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-0000000055a6', '00000000-0000-4000-8000-0000000000f2', extensions.crypt('727272', extensions.gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-0000000055a7', '00000000-0000-4000-8000-0000000000f2', extensions.crypt('737373', extensions.gen_salt('bf', 8)))
on conflict (person_id) do nothing;
insert into private.person_permissions (organization_id, person_id, permission)
select '00000000-0000-4000-8000-0000000000f2'::uuid, '00000000-0000-4000-8000-0000000055a5'::uuid, perm
  from (values ('team.finance.read'), ('business.health.read'), ('movement.confirm'), ('period.decide'), ('payment.confirm'),
               ('period.close'), ('records.correct')) x(perm)
union all select '00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000055a6', 'business.health.read'
on conflict do nothing;
insert into public.rule_versions (organization_id, person_id, kind, percent, effective_from, set_by_person_id, set_at)
select '00000000-0000-4000-8000-0000000000f2', ('00000000-0000-4000-8000-0000000055a' || n)::uuid, 'standing', 40, '2000-01-01',
       '00000000-0000-4000-8000-0000000055a5', '2000-01-01 09:00+01'
  from generate_series(1, 4) n
 where not exists (select 1 from public.rule_versions rv where rv.person_id = ('00000000-0000-4000-8000-0000000055a' || n)::uuid);

do $$
declare
  v_org uuid := '00000000-0000-4000-8000-0000000000f2'; v_mgr uuid := '00000000-0000-4000-8000-0000000055a5';
  v_dev uuid := '00000000-0000-4000-8000-0000000faede'; v_cash uuid := '00000000-0000-4000-8000-0000000055a0';
  -- per period: [service (1–6), professional (1–4 = A–D), count, value]
  v_spec jsonb := '[
    [[1,1,5,500000],[1,2,5,500000],[2,1,1,2000000],[2,2,1,2000000],[3,3,2,400000],[3,4,2,400000]],
    [[1,1,10,500000],[1,2,10,500000],[2,1,2,2000000],[2,2,2,2000000],[3,3,3,400000],[3,4,3,400000],[4,3,3,500000],[4,4,2,500000],
     [5,1,5,1000000],[5,3,5,1000000],[6,2,1,800000]],
    [[1,1,10,500000],[1,2,10,500000],[2,1,3,2000000],[2,2,2,2000000],[3,3,3,400000],[3,4,2,400000],[4,3,4,500000],[4,4,3,500000],
     [5,1,4,1000000],[5,3,4,1000000],[6,2,2,800000]],
    [[1,1,15,500000],[1,2,15,500000],[2,1,2,2000000],[2,2,2,2000000],[3,3,3,400000],[3,4,3,400000],[4,3,5,500000],[4,4,4,500000],
     [5,1,3,1000000],[5,3,3,1000000],[6,2,4,800000]]]';
  e jsonb; v_n int; i int; v_start date; v_pid uuid; v_at timestamptz; v_rec uuid; v_p public.periods; v_pos jsonb; v_aid uuid; v_lines jsonb; x jsonb;
begin
  for v_n in 1..4 loop
    v_start := date '2025-05-05' + (v_n - 1) * 7;
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'Semana S' || v_n, v_start, v_start + 6)
    on conflict do nothing returning id into v_pid;
    if v_pid is null then continue; end if;
    v_at := (v_start::text || ' 12:00+01')::timestamptz;
    for e in select y from jsonb_array_elements(v_spec -> (v_n - 1)) y loop
      for i in 1..(e ->> 2)::int loop
        insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, recorded_at, device_id, command_id)
        values (v_org, ('00000000-0000-4000-8000-0000000055a' || (e ->> 1))::uuid, ('00000000-0000-4000-8000-0000000055b' || (e ->> 0))::uuid,
                (e ->> 3)::bigint, 'single', v_at, v_at, v_dev, gen_random_uuid()) returning id into v_rec;
        insert into public.service_record_payments values (v_rec, v_org, v_cash, (e ->> 3)::bigint);
      end loop;
    end loop;
    if v_n = 4 then                                            -- a Cor recorded by mistake and cancelled
      insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, recorded_at, device_id, command_id)
      values (v_org, '00000000-0000-4000-8000-0000000055a1', '00000000-0000-4000-8000-0000000055b2', 2000000, 'single', v_at, v_at, v_dev, gen_random_uuid())
      returning id into v_rec;
      insert into public.service_record_payments values (v_rec, v_org, v_cash, 2000000);
      insert into public.record_cancellations (organization_id, record_kind, record_id, period_id, reason, cancelled_by_person_id, command_id)
      values (v_org, 'service', v_rec, v_pid, 'Registo de teste anulado', v_mgr, gen_random_uuid());
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
end $$;

-- S5: ended, open, nothing recorded (zero production).
insert into public.periods (organization_id, label, starts_on, ends_on)
values ('00000000-0000-4000-8000-0000000000f2', 'Semana S5', '2025-06-02', '2025-06-08') on conflict do nothing;
