-- Offline 1 · capture time and inactive-reference codes (ADR-0010 §2, §10). Synthetic, not pilot data.
-- Used only by tests/db/offline_capture.test.ts. Each organization has one-day periods from 2026-10-01 to 2027-12-31,
-- so a capture up to 48 hours old always falls in a period of its own day.
--   "Teste Offline O" (TEST-ORG-O-2026): delayed capture, bounds, idempotency, inactive references. Never approved.
--     99b1 Profissional O (active) · 99b2 Gestor O (movement.confirm + Fecho reads, PIN 919191) · 99b9 inactive person
--     one active and one inactive service, payment method, expense category, purchase origin and product
--   "Teste Offline P" (TEST-ORG-P-2026): the test approves the period of a recent day (empty: nothing pending).
--   "Teste Offline Q" (TEST-ORG-Q-2026): the test approves and closes the period of a recent day (empty: nothing to pay).
--     98b2 Gestor P (PIN 929292) · 97b2 Gestor Q (PIN 939393): movement.confirm + every Fecho permission
insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values
  ('00000000-0000-4000-8000-0000000000f6', 'Teste Offline O', 'Africa/Luanda', 'AOA', 2, 'Kz'),
  ('00000000-0000-4000-8000-0000000000f7', 'Teste Offline P', 'Africa/Luanda', 'AOA', 2, 'Kz'),
  ('00000000-0000-4000-8000-0000000000f8', 'Teste Offline Q', 'Africa/Luanda', 'AOA', 2, 'Kz') on conflict (id) do nothing;
insert into private.enrollment_codes (code_hash, organization_id, label, expires_at, max_uses) values
  (encode(extensions.digest('TEST-ORG-O-2026', 'sha256'), 'hex'), '00000000-0000-4000-8000-0000000000f6', 'Test device O', '2027-12-31', 100000),
  (encode(extensions.digest('TEST-ORG-P-2026', 'sha256'), 'hex'), '00000000-0000-4000-8000-0000000000f7', 'Test device P', '2027-12-31', 100000),
  (encode(extensions.digest('TEST-ORG-Q-2026', 'sha256'), 'hex'), '00000000-0000-4000-8000-0000000000f8', 'Test device Q', '2027-12-31', 100000)
on conflict (code_hash) do nothing;

insert into public.payment_methods (id, organization_id, code, label, sort_order, active) values
  ('00000000-0000-4000-8000-0000000099a0', '00000000-0000-4000-8000-0000000000f6', 'numerario', 'Numerário', 1, true),
  ('00000000-0000-4000-8000-0000000099a9', '00000000-0000-4000-8000-0000000000f6', 'cheque', 'Cheque (desativado)', 2, false),
  ('00000000-0000-4000-8000-0000000098a0', '00000000-0000-4000-8000-0000000000f7', 'numerario', 'Numerário', 1, true),
  ('00000000-0000-4000-8000-0000000097a0', '00000000-0000-4000-8000-0000000000f8', 'numerario', 'Numerário', 1, true) on conflict (id) do nothing;
insert into public.people (id, organization_id, display_name, active) values
  ('00000000-0000-4000-8000-0000000099b1', '00000000-0000-4000-8000-0000000000f6', 'Profissional O', true),
  ('00000000-0000-4000-8000-0000000099b2', '00000000-0000-4000-8000-0000000000f6', 'Gestor O', true),
  ('00000000-0000-4000-8000-0000000099b9', '00000000-0000-4000-8000-0000000000f6', 'Antiga O', false),
  ('00000000-0000-4000-8000-0000000098b1', '00000000-0000-4000-8000-0000000000f7', 'Profissional P', true),
  ('00000000-0000-4000-8000-0000000098b2', '00000000-0000-4000-8000-0000000000f7', 'Gestor P', true),
  ('00000000-0000-4000-8000-0000000097b1', '00000000-0000-4000-8000-0000000000f8', 'Profissional Q', true),
  ('00000000-0000-4000-8000-0000000097b2', '00000000-0000-4000-8000-0000000000f8', 'Gestor Q', true) on conflict (id) do nothing;
insert into public.person_capabilities (organization_id, person_id, label, sort_order) values
  ('00000000-0000-4000-8000-0000000000f6', '00000000-0000-4000-8000-0000000099b1', 'Cabelo', 1),
  ('00000000-0000-4000-8000-0000000000f6', '00000000-0000-4000-8000-0000000099b9', 'Cabelo', 1),
  ('00000000-0000-4000-8000-0000000000f7', '00000000-0000-4000-8000-0000000098b1', 'Cabelo', 1),
  ('00000000-0000-4000-8000-0000000000f8', '00000000-0000-4000-8000-0000000097b1', 'Cabelo', 1) on conflict do nothing;
insert into private.person_secrets (person_id, organization_id, secret_hash) values
  ('00000000-0000-4000-8000-0000000099b2', '00000000-0000-4000-8000-0000000000f6', extensions.crypt('919191', extensions.gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-0000000098b2', '00000000-0000-4000-8000-0000000000f7', extensions.crypt('929292', extensions.gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-0000000097b2', '00000000-0000-4000-8000-0000000000f8', extensions.crypt('939393', extensions.gen_salt('bf', 8)))
on conflict (person_id) do nothing;
insert into private.person_permissions (organization_id, person_id, permission)
select o::uuid, p::uuid, perm
  from (values ('00000000-0000-4000-8000-0000000000f6', '00000000-0000-4000-8000-0000000099b2'),
               ('00000000-0000-4000-8000-0000000000f7', '00000000-0000-4000-8000-0000000098b2'),
               ('00000000-0000-4000-8000-0000000000f8', '00000000-0000-4000-8000-0000000097b2')) m(o, p)
 cross join (values ('team.finance.read'), ('movement.confirm'), ('period.decide'), ('payment.confirm'), ('period.close')) x(perm)
on conflict do nothing;

insert into public.services (id, organization_id, name, default_price_minor, sort_order, active) values
  ('00000000-0000-4000-8000-0000000099c1', '00000000-0000-4000-8000-0000000000f6', 'Serviço O', 1000000, 1, true),
  ('00000000-0000-4000-8000-0000000099c9', '00000000-0000-4000-8000-0000000000f6', 'Serviço O Desativado', 1000000, 2, false),
  ('00000000-0000-4000-8000-0000000098c1', '00000000-0000-4000-8000-0000000000f7', 'Serviço P', 1000000, 1, true),
  ('00000000-0000-4000-8000-0000000097c1', '00000000-0000-4000-8000-0000000000f8', 'Serviço Q', 1000000, 1, true) on conflict (id) do nothing;
insert into public.expense_categories (id, organization_id, label, sort_order, active) values
  ('00000000-0000-4000-8000-0000000099d1', '00000000-0000-4000-8000-0000000000f6', 'Despesa O', 1, true),
  ('00000000-0000-4000-8000-0000000099d9', '00000000-0000-4000-8000-0000000000f6', 'Despesa O Desativada', 2, false) on conflict (id) do nothing;
insert into public.purchase_origins (id, organization_id, label, sort_order, active) values
  ('00000000-0000-4000-8000-0000000099e1', '00000000-0000-4000-8000-0000000000f6', 'Mercado', 1, true),
  ('00000000-0000-4000-8000-0000000099e9', '00000000-0000-4000-8000-0000000000f6', 'Loja antiga', 2, false) on conflict (id) do nothing;
insert into public.unit_words (organization_id, word, sort_order) values ('00000000-0000-4000-8000-0000000000f6', 'unid.', 1) on conflict do nothing;
insert into public.products (id, organization_id, name, unit_word, active) values
  ('00000000-0000-4000-8000-0000000099f1', '00000000-0000-4000-8000-0000000000f6', 'Produto O', 'unid.', true),
  ('00000000-0000-4000-8000-0000000099f9', '00000000-0000-4000-8000-0000000000f6', 'Produto O Desativado', 'unid.', false) on conflict do nothing;

insert into public.periods (organization_id, label, starts_on, ends_on)
select o::uuid, 'Dia Offline ' || d::date, d::date, d::date
  from (values ('00000000-0000-4000-8000-0000000000f6'), ('00000000-0000-4000-8000-0000000000f7'), ('00000000-0000-4000-8000-0000000000f8')) x(o)
 cross join generate_series(date '2026-10-01', date '2027-12-31', interval '1 day') d
on conflict do nothing;
