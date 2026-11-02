-- Production by payment method in the Fecho (Sollelio, 2026-11-02; from pilot use: weekly reconciliation, and the last
-- week of a month for the month-end review — no monthly period). For each professional of the period: how much of their
-- production (service value, not earnings or payments to them) the customers paid by each of the organization's payment
-- methods. Exact, from the stored parts: every service has one part per method used (one, or two for a mixed payment)
-- and record_service refuses parts that do not add up to the service value (MIXED_PAYMENT_MISMATCH), so a mixed service
-- counts each part under its own method — no allocation rule.
--   · private.period_production_by_method: same records as the production total (active service records of the
--     period's days in the organization's timezone; cancelled ones excluded). Reconciled against the production figures
--     the Fecho shows — the live position, or the close statement of a closed period — person by person: same count,
--     same total, every record's parts add up to its value, the methods add up to the total. Otherwise that person's
--     methods are not given (reconciled false): never an approximate breakdown.
--   · public.fecho_period: adds 'production_by_method' (same authorization: the finance viewer in the private context).
--     Nothing else changes; close statements, approvals and Business Health are untouched.
create or replace function private.period_production_by_method(p_org uuid, p_period public.periods, p_pos jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  with recs as (
    select r.id, r.person_id, r.value_minor, r.payment_kind
      from private.active_service_records r join public.organizations o on o.id = r.organization_id
     where r.organization_id = p_org
       and (r.occurred_at at time zone o.timezone)::date between p_period.starts_on and p_period.ends_on
  ),
  parts as (
    select recs.id, recs.person_id, sp.payment_method_id, sp.amount_minor
      from recs join public.service_record_payments sp on sp.service_record_id = recs.id and sp.organization_id = p_org
  ),
  per_person as (
    select recs.person_id, count(*) as n, sum(recs.value_minor) as total, count(*) filter (where recs.payment_kind = 'mixed') as mixed,
           count(*) filter (where recs.value_minor is distinct from (select sum(p.amount_minor) from parts p where p.id = recs.id)) as broken
      from recs group by recs.person_id
  ),
  by_method as (
    select parts.person_id, m.code, m.label, m.sort_order, sum(parts.amount_minor) as amount, count(distinct parts.id) as n
      from parts join public.payment_methods m on m.id = parts.payment_method_id and m.organization_id = p_org
     group by parts.person_id, m.code, m.label, m.sort_order
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'person_id', x ->> 'person_id',
           'reconciled', c.ok,
           'mixed_count', case when c.ok then coalesce(l.mixed, 0) end,
           'methods', case when c.ok then coalesce(mm.methods, '[]'::jsonb) end) order by t.ord), '[]'::jsonb)
    from jsonb_array_elements(p_pos -> 'people') with ordinality t(x, ord)
    left join per_person l on l.person_id = (x ->> 'person_id')::uuid
    left join lateral (
      select jsonb_agg(jsonb_build_object('code', b.code, 'label', b.label, 'amount_minor', b.amount, 'count', b.n) order by b.sort_order, b.label) as methods,
             sum(b.amount) as total
        from by_method b where b.person_id = (x ->> 'person_id')::uuid) mm on true
    cross join lateral (
      select coalesce(l.n, 0) = (x -> 'production' ->> 'count')::bigint
         and coalesce(l.total, 0) = (x -> 'production' ->> 'total_minor')::bigint
         and coalesce(l.broken, 0) = 0
         and coalesce(mm.total, 0) = (x -> 'production' ->> 'total_minor')::bigint as ok) c
$$;
revoke all on function private.period_production_by_method(uuid, public.periods, jsonb) from public, anon, authenticated;

-- fecho_period: patched in place (abort unless the anchor occurs once)
do $$
declare
  v_src text := pg_get_functiondef('public.fecho_period(uuid)'::regprocedure);
  v_a text := $a$'exceptions', v_exceptions,$a$;
  v_b text := $b$'exceptions', v_exceptions,
    'production_by_method', private.period_production_by_method(v_org, v_period, v_pos),$b$;
begin
  if (length(v_src) - length(replace(v_src, v_a, ''))) / length(v_a) <> 1 then raise exception 'production by method patch: fecho_period anchor not found once'; end if;
  execute replace(v_src, v_a, v_b);
  if position('period_production_by_method' in pg_get_functiondef('public.fecho_period(uuid)'::regprocedure)) = 0 then raise exception 'production by method patch failed'; end if;
end $$;

-- Self-test, rolled back: single, two methods and mixed parts; a cancelled record and another week left out; the
-- breakdown adds up to the production total; a record whose parts do not add up withholds that person's methods.
do $$
declare
  v_org uuid := gen_random_uuid(); v_a uuid := gen_random_uuid(); v_b uuid := gen_random_uuid(); v_svc uuid := gen_random_uuid();
  v_cash uuid := gen_random_uuid(); v_tr uuid := gen_random_uuid(); v_dev uuid := gen_random_uuid(); v_p public.periods; v_r uuid; v_m uuid; h jsonb; x jsonb;
begin
  begin
    insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values (v_org, 'selftest', 'Africa/Luanda', 'XXX', 2, 'X');
    insert into public.people (id, organization_id, display_name) values (v_a, v_org, 'A'), (v_b, v_org, 'B');
    insert into public.services (id, organization_id, name, default_price_minor) values (v_svc, v_org, 'S', 1000);
    insert into public.payment_methods (id, organization_id, code, label, sort_order) values (v_cash, v_org, 'c', 'Cash', 1), (v_tr, v_org, 't', 'Transfer', 2);
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'p', date '2020-01-06', date '2020-01-11') returning * into v_p;
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'q', date '2020-01-13', date '2020-01-18');
    -- A: 4.000 cash + 6.000 transfer, plus a mixed 3.000 (1.000 cash + 2.000 transfer); a cancelled 9.000 cash; next week 7.000
    insert into public.service_records (id, organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, device_id, command_id) values
      (gen_random_uuid(), v_org, v_a, v_svc, 4000, 'single', timestamptz '2020-01-06 12:00+01', v_dev, gen_random_uuid()) returning id into v_r;
    insert into public.service_record_payments values (v_r, v_org, v_cash, 4000);
    insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, device_id, command_id) values
      (v_org, v_a, v_svc, 6000, 'single', timestamptz '2020-01-07 12:00+01', v_dev, gen_random_uuid()) returning id into v_r;
    insert into public.service_record_payments values (v_r, v_org, v_tr, 6000);
    insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, device_id, command_id) values
      (v_org, v_a, v_svc, 3000, 'mixed', timestamptz '2020-01-08 12:00+01', v_dev, gen_random_uuid()) returning id into v_m;
    insert into public.service_record_payments values (v_m, v_org, v_cash, 1000), (v_m, v_org, v_tr, 2000);
    insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, device_id, command_id) values
      (v_org, v_a, v_svc, 9000, 'single', timestamptz '2020-01-09 12:00+01', v_dev, gen_random_uuid()) returning id into v_r;
    insert into public.service_record_payments values (v_r, v_org, v_cash, 9000);
    insert into public.record_cancellations (organization_id, record_kind, record_id, reason, cancelled_by_person_id, command_id) values (v_org, 'service', v_r, 'x', v_a, gen_random_uuid());
    insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, device_id, command_id) values
      (v_org, v_a, v_svc, 7000, 'single', timestamptz '2020-01-13 12:00+01', v_dev, gen_random_uuid()) returning id into v_r;
    insert into public.service_record_payments values (v_r, v_org, v_cash, 7000);
    -- B: 5.000 transfer only
    insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, device_id, command_id) values
      (v_org, v_b, v_svc, 5000, 'single', timestamptz '2020-01-10 12:00+01', v_dev, gen_random_uuid()) returning id into v_r;
    insert into public.service_record_payments values (v_r, v_org, v_tr, 5000);

    h := private.period_production_by_method(v_org, v_p, private.period_position(v_org, v_p));
    select e into x from jsonb_array_elements(h) e where e ->> 'person_id' = v_a::text;
    if x -> 'methods' is distinct from jsonb_build_array(jsonb_build_object('code', 'c', 'label', 'Cash', 'amount_minor', 5000, 'count', 2),
                                                         jsonb_build_object('code', 't', 'label', 'Transfer', 'amount_minor', 8000, 'count', 2))
       or (x ->> 'reconciled')::boolean is not true or (x ->> 'mixed_count')::int <> 1 then raise exception 'selftest: A %', x; end if;
    select e into x from jsonb_array_elements(h) e where e ->> 'person_id' = v_b::text;
    if x -> 'methods' is distinct from jsonb_build_array(jsonb_build_object('code', 't', 'label', 'Transfer', 'amount_minor', 5000, 'count', 1))
       or (x ->> 'reconciled')::boolean is not true then raise exception 'selftest: B %', x; end if;
    -- parts that no longer add up to the value: A's methods are withheld, B's are unaffected
    update public.service_record_payments set amount_minor = 1500 where service_record_id = v_m and payment_method_id = v_cash;
    h := private.period_production_by_method(v_org, v_p, private.period_position(v_org, v_p));
    select e into x from jsonb_array_elements(h) e where e ->> 'person_id' = v_a::text;
    if (x ->> 'reconciled')::boolean is not false or x -> 'methods' <> 'null'::jsonb then raise exception 'selftest: mismatch %', x; end if;
    select e into x from jsonb_array_elements(h) e where e ->> 'person_id' = v_b::text;
    if (x ->> 'reconciled')::boolean is not true then raise exception 'selftest: B after A mismatch'; end if;
    raise exception 'selftest_ok';
  exception when others then
    if sqlerrm <> 'selftest_ok' then raise; end if;
  end;
end $$;
