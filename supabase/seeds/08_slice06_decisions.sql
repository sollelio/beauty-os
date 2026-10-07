-- Slice 06 decisions (reopen, records after approval). Synthetic, not pilot data.
-- 1. The reopen boundary (B8) for the people who already close periods.
-- 2. "Teste Fecho C" (code TEST-ORG-C-2026), used only by tests/db/slice06: one-day periods from 2026-10-07 to
--    2027-12-31 so "today" always falls in a period of its own (approval blocks capture in it), and a pool of past
--    "Reabrir Teste" periods whose approved total is 0 (close and reopen without payments).
--    People: c201 (standing 50%, PIN 121212, no permissions) · c202 (all Fecho permissions, PIN 343434).
insert into private.person_permissions (organization_id, person_id, permission) values
  ('00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-00000000d204', 'period.reopen'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a202', 'period.reopen'),
  ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-00000000f205', 'period.reopen')
on conflict do nothing;

insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values
  ('00000000-0000-4000-8000-0000000000c1', 'Teste Fecho C', 'Africa/Luanda', 'AOA', 2, 'Kz') on conflict (id) do nothing;
insert into private.enrollment_codes (code_hash, organization_id, label, expires_at, max_uses) values
  (encode(extensions.digest('TEST-ORG-C-2026', 'sha256'), 'hex'), '00000000-0000-4000-8000-0000000000c1', 'Test device C', '2027-12-31', 100000)
on conflict (code_hash) do nothing;
insert into public.payment_methods (id, organization_id, code, label, sort_order) values
  ('00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-0000000000c1', 'numerario', 'Numerário', 1) on conflict (id) do nothing;
insert into public.people (id, organization_id, display_name) values
  ('00000000-0000-4000-8000-00000000c201', '00000000-0000-4000-8000-0000000000c1', 'Profissional Teste C'),
  ('00000000-0000-4000-8000-00000000c202', '00000000-0000-4000-8000-0000000000c1', 'Gestor Teste C') on conflict (id) do nothing;
insert into public.person_capabilities (organization_id, person_id, label, sort_order) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000c201', 'Cabelo', 1) on conflict do nothing;
insert into private.person_secrets (person_id, organization_id, secret_hash) values
  ('00000000-0000-4000-8000-00000000c201', '00000000-0000-4000-8000-0000000000c1', extensions.crypt('121212', extensions.gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-00000000c202', '00000000-0000-4000-8000-0000000000c1', extensions.crypt('343434', extensions.gen_salt('bf', 8)))
on conflict (person_id) do nothing;
insert into private.person_permissions (organization_id, person_id, permission)
select '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000c202', perm
  from (values ('team.finance.read'), ('movement.confirm'), ('period.decide'), ('payment.confirm'), ('period.close'), ('period.reopen')) x(perm)
on conflict do nothing;
insert into public.services (id, organization_id, name, default_price_minor, sort_order) values
  ('00000000-0000-4000-8000-00000000c301', '00000000-0000-4000-8000-0000000000c1', 'Serviço Teste C', 1000000, 1) on conflict (id) do nothing;
insert into public.expense_categories (id, organization_id, label, sort_order) values
  ('00000000-0000-4000-8000-00000000c401', '00000000-0000-4000-8000-0000000000c1', 'Categoria Teste C', 1) on conflict (id) do nothing;
insert into public.purchase_origins (id, organization_id, label, sort_order) values
  ('00000000-0000-4000-8000-00000000c501', '00000000-0000-4000-8000-0000000000c1', 'Origem Teste C', 1) on conflict (id) do nothing;
insert into public.unit_words (organization_id, word, sort_order) values ('00000000-0000-4000-8000-0000000000c1', 'unid.', 1) on conflict do nothing;
insert into public.products (id, organization_id, name, unit_word) values
  ('00000000-0000-4000-8000-00000000c601', '00000000-0000-4000-8000-0000000000c1', 'Produto Teste C', 'unid.') on conflict do nothing;
insert into public.rule_versions (organization_id, person_id, kind, percent, effective_from, set_by_person_id, set_at) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000c201', 'standing', 50, '2000-01-01', '00000000-0000-4000-8000-00000000c202', '2000-01-01 09:00+01')
on conflict do nothing;

insert into public.periods (organization_id, label, starts_on, ends_on)
select '00000000-0000-4000-8000-0000000000c1', 'Dia Teste ' || d::date, d::date, d::date
  from generate_series(date '2026-10-07', date '2027-12-31', interval '1 day') d
on conflict do nothing;

do $$
declare v_org uuid := '00000000-0000-4000-8000-0000000000c1'; v_pid uuid; v_day date; v_at timestamptz; v_rec uuid; n int;
begin
  for n in 1..40 loop
    v_day := date '2001-01-01' + (n - 1);
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'Reabrir Teste ' || lpad(n::text, 2, '0'), v_day, v_day)
    on conflict do nothing returning id into v_pid;
    if v_pid is null then continue; end if;
    v_at := (v_day::text || ' 12:00+01')::timestamptz;
    -- earned 5.000, advance 5.000 → approved 0: nothing to pay, the period can close without payments
    insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, recorded_at, device_id, command_id)
    values (v_org, '00000000-0000-4000-8000-00000000c201', '00000000-0000-4000-8000-00000000c301', 1000000, 'single', v_at, v_at, '00000000-0000-4000-8000-0000000ccede', gen_random_uuid())
    returning id into v_rec;
    insert into public.service_record_payments values (v_rec, v_org, '00000000-0000-4000-8000-00000000c101', 1000000);
    insert into public.advances (organization_id, person_id, amount_minor, payment_method_id, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id)
    values (v_org, '00000000-0000-4000-8000-00000000c201', 500000, '00000000-0000-4000-8000-00000000c101', v_at, v_at, '00000000-0000-4000-8000-0000000ccede', '00000000-0000-4000-8000-00000000c202', gen_random_uuid());
  end loop;
end $$;
