-- Slice 3 · identity selectors by purpose and the support identity. Synthetic, not pilot data (its shape mirrors a salon
-- with two Fecho managers, professionals and an organization-scoped support identity). Used only by
-- tests/db/person_kind.test.ts and tests/sql/person_kind_probe.sql.
-- "Teste Pessoas" (TEST-ORG-PESSOAS-2026):
--   fbb1 Gestor Pessoas        (PIN 141414; Fecho/Negócio manager permissions; a service capability)
--   fbb2 Gestora Pessoas       (PIN 151515; team.finance.read, business.health.read, payment.confirm, period.decide, period.close)
--   fbb3 Profissional Pessoas A (PIN 161616; a capability; no permission)
--   fbb4 Profissional Pessoas B (PIN 171717; a capability; no permission)
--   fbb5 Profissional sem PIN  (a capability; no PIN)
--   fbb6 Suporte Pessoas       (kind support; PIN 181818; every permission; no capability)
--   fbb7 Leitora Negócio       (PIN 191919; business.health.read only)
--   fbb8 Gestor Inativo        (INACTIVE; PIN 101010; team.finance.read, business.health.read, movement.confirm)
--   one empty period (Negócio reads need one); a service and a product (attribution checks record real movements)
insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values
  ('00000000-0000-4000-8000-0000000000fb', 'Teste Pessoas', 'Africa/Luanda', 'AOA', 2, 'Kz') on conflict (id) do nothing;
insert into private.enrollment_codes (code_hash, organization_id, label, expires_at, max_uses) values
  (encode(extensions.digest('TEST-ORG-PESSOAS-2026', 'sha256'), 'hex'), '00000000-0000-4000-8000-0000000000fb', 'Test device Pessoas', '2027-12-31', 100000)
on conflict (code_hash) do nothing;
insert into public.payment_methods (id, organization_id, code, label, sort_order) values
  ('00000000-0000-4000-8000-00000000fba0', '00000000-0000-4000-8000-0000000000fb', 'numerario', 'Numerário', 1) on conflict (id) do nothing;
insert into public.services (id, organization_id, name, default_price_minor, sort_order) values
  ('00000000-0000-4000-8000-00000000fbd1', '00000000-0000-4000-8000-0000000000fb', 'Corte Pessoas', 100000, 1) on conflict (id) do nothing;
insert into public.unit_words (organization_id, word, sort_order) values ('00000000-0000-4000-8000-0000000000fb', 'frasco', 1) on conflict do nothing;
insert into public.products (id, organization_id, name, unit_word) values
  ('00000000-0000-4000-8000-00000000fbe1', '00000000-0000-4000-8000-0000000000fb', 'Champô Pessoas', 'frasco') on conflict (id) do nothing;
insert into public.periods (id, organization_id, label, starts_on, ends_on) values
  ('00000000-0000-4000-8000-00000000fbc1', '00000000-0000-4000-8000-0000000000fb', 'Pessoas 2026', '2026-01-05', '2026-01-11') on conflict (id) do nothing;
insert into public.people (id, organization_id, display_name, active, kind) values
  ('00000000-0000-4000-8000-00000000fbb1', '00000000-0000-4000-8000-0000000000fb', 'Gestor Pessoas', true, 'personnel'),
  ('00000000-0000-4000-8000-00000000fbb2', '00000000-0000-4000-8000-0000000000fb', 'Gestora Pessoas', true, 'personnel'),
  ('00000000-0000-4000-8000-00000000fbb3', '00000000-0000-4000-8000-0000000000fb', 'Profissional Pessoas A', true, 'personnel'),
  ('00000000-0000-4000-8000-00000000fbb4', '00000000-0000-4000-8000-0000000000fb', 'Profissional Pessoas B', true, 'personnel'),
  ('00000000-0000-4000-8000-00000000fbb5', '00000000-0000-4000-8000-0000000000fb', 'Profissional sem PIN', true, 'personnel'),
  ('00000000-0000-4000-8000-00000000fbb6', '00000000-0000-4000-8000-0000000000fb', 'Suporte Pessoas', true, 'support'),
  ('00000000-0000-4000-8000-00000000fbb7', '00000000-0000-4000-8000-0000000000fb', 'Leitora Negócio', true, 'personnel'),
  ('00000000-0000-4000-8000-00000000fbb8', '00000000-0000-4000-8000-0000000000fb', 'Gestor Inativo', false, 'personnel')
on conflict (id) do nothing;
insert into public.person_capabilities (organization_id, person_id, label, sort_order) values
  ('00000000-0000-4000-8000-0000000000fb', '00000000-0000-4000-8000-00000000fbb1', 'Barbearia', 1),
  ('00000000-0000-4000-8000-0000000000fb', '00000000-0000-4000-8000-00000000fbb3', 'Cabelo', 1),
  ('00000000-0000-4000-8000-0000000000fb', '00000000-0000-4000-8000-00000000fbb4', 'Unhas', 1),
  ('00000000-0000-4000-8000-0000000000fb', '00000000-0000-4000-8000-00000000fbb5', 'Cabelo', 1)
on conflict do nothing;
insert into private.person_secrets (person_id, organization_id, secret_hash)
select p, '00000000-0000-4000-8000-0000000000fb', extensions.crypt(pin, extensions.gen_salt('bf', 8))
  from (values ('00000000-0000-4000-8000-00000000fbb1'::uuid, '141414'), ('00000000-0000-4000-8000-00000000fbb2'::uuid, '151515'),
               ('00000000-0000-4000-8000-00000000fbb3'::uuid, '161616'), ('00000000-0000-4000-8000-00000000fbb4'::uuid, '171717'),
               ('00000000-0000-4000-8000-00000000fbb6'::uuid, '181818'), ('00000000-0000-4000-8000-00000000fbb7'::uuid, '191919'),
               ('00000000-0000-4000-8000-00000000fbb8'::uuid, '101010')) s(p, pin)
on conflict (person_id) do nothing;
insert into private.person_permissions (organization_id, person_id, permission)
select '00000000-0000-4000-8000-0000000000fb', p::uuid, perm
  from (values
    ('00000000-0000-4000-8000-00000000fbb1', 'team.finance.read'), ('00000000-0000-4000-8000-00000000fbb1', 'business.health.read'),
    ('00000000-0000-4000-8000-00000000fbb1', 'movement.confirm'), ('00000000-0000-4000-8000-00000000fbb1', 'period.decide'),
    ('00000000-0000-4000-8000-00000000fbb1', 'period.close'), ('00000000-0000-4000-8000-00000000fbb1', 'period.reopen'),
    ('00000000-0000-4000-8000-00000000fbb1', 'records.correct'), ('00000000-0000-4000-8000-00000000fbb1', 'catalogue.manage'),
    ('00000000-0000-4000-8000-00000000fbb2', 'team.finance.read'), ('00000000-0000-4000-8000-00000000fbb2', 'business.health.read'),
    ('00000000-0000-4000-8000-00000000fbb2', 'payment.confirm'), ('00000000-0000-4000-8000-00000000fbb2', 'period.decide'),
    ('00000000-0000-4000-8000-00000000fbb2', 'period.close'),
    ('00000000-0000-4000-8000-00000000fbb6', 'team.finance.read'), ('00000000-0000-4000-8000-00000000fbb6', 'business.health.read'),
    ('00000000-0000-4000-8000-00000000fbb6', 'movement.confirm'), ('00000000-0000-4000-8000-00000000fbb6', 'payment.confirm'),
    ('00000000-0000-4000-8000-00000000fbb6', 'period.decide'), ('00000000-0000-4000-8000-00000000fbb6', 'period.close'),
    ('00000000-0000-4000-8000-00000000fbb6', 'period.reopen'), ('00000000-0000-4000-8000-00000000fbb6', 'records.correct'),
    ('00000000-0000-4000-8000-00000000fbb6', 'catalogue.manage'),
    ('00000000-0000-4000-8000-00000000fbb7', 'business.health.read'),
    ('00000000-0000-4000-8000-00000000fbb8', 'team.finance.read'), ('00000000-0000-4000-8000-00000000fbb8', 'business.health.read'),
    ('00000000-0000-4000-8000-00000000fbb8', 'movement.confirm')) x(p, perm)
on conflict do nothing;
