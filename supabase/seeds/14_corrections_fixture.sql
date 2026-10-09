-- tests/db/corrections: a fixed, approved period in "Teste Fecho C" with one service of c201, so the test does not
-- depend on which day it runs or on slice06 having approved and paid today's period first. Synthetic, idempotent.
--   "Correções C" · 2002-01-01 (outside the Dia Teste and Reabrir Teste ranges) · one service 10.000 · Pronto para pagamento
do $$
declare
  v_org uuid := '00000000-0000-4000-8000-0000000000c1'; v_mgr uuid := '00000000-0000-4000-8000-00000000c202';
  v_day date := date '2002-01-01'; v_at timestamptz := '2002-01-01 12:00+01'; v_pid uuid; v_rec uuid; v_p public.periods; v_pos jsonb; v_aid uuid;
begin
  insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'Correções C', v_day, v_day)
  on conflict do nothing returning id into v_pid;
  if v_pid is null then return; end if;
  insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, recorded_at, device_id, command_id)
  values (v_org, '00000000-0000-4000-8000-00000000c201', '00000000-0000-4000-8000-00000000c301', 1000000, 'single', v_at, v_at, '00000000-0000-4000-8000-0000000ccede', gen_random_uuid())
  returning id into v_rec;
  insert into public.service_record_payments values (v_rec, v_org, '00000000-0000-4000-8000-00000000c101', 1000000);
  -- approve (as approve_period does)
  select * into v_p from public.periods where id = v_pid;
  v_pos := private.period_position(v_org, v_p);
  insert into public.period_approvals (organization_id, period_id, approved_by_person_id, approved_at, review_revision, calculation_version, totals, cases, command_id)
  values (v_org, v_pid, v_mgr, v_at + interval '1 day', v_p.review_revision, private.calculation_version(), v_pos - 'people', '[]'::jsonb, gen_random_uuid())
  returning id into v_aid;
  insert into public.period_approval_lines (approval_id, organization_id, person_id, display_name, production_count, production_minor, rule_kind,
         percent, earned_minor, advances_minor, payments_minor, approved_minor, excess_minor)
  select v_aid, v_org, (y ->> 'person_id')::uuid, y ->> 'display_name', (y -> 'production' ->> 'count')::int, (y -> 'production' ->> 'total_minor')::bigint,
         y -> 'rule' ->> 'kind', (y -> 'rule' ->> 'percent')::numeric, (y ->> 'earned_minor')::bigint, (y -> 'advances' ->> 'total_minor')::bigint,
         (y -> 'payments' ->> 'total_minor')::bigint, (y ->> 'remaining_minor')::bigint, (y ->> 'excess_minor')::bigint
    from jsonb_array_elements(v_pos -> 'people') y;
  update public.periods set state = 'pronto_para_pagamento', review_revision = review_revision + 1 where id = v_pid returning * into v_p;
  insert into public.period_transitions (organization_id, period_id, from_state, to_state, actor_person_id, at, review_revision)
  values (v_org, v_pid, 'aberto', 'pronto_para_pagamento', v_mgr, v_at + interval '1 day', v_p.review_revision);
end $$;
