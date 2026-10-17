-- S1 · inactive person authorization guard. Synthetic, not pilot data. Used only by tests/db/inactive_person.test.ts.
-- "Teste Inativo I" (TEST-ORG-INATIVO-2026):
--   fab1 Profissional Inativo-I (active; beneficiary of advances; no PIN)
--   fab2 Gestora Ativa         (active;   PIN 919191; movement.confirm + team.finance.read)
--   fab3 Pessoa Inativa        (INACTIVE; PIN 929292; movement.confirm + team.finance.read — dormant)
--   fab4 Gestor Manual         (active;   PIN 939393; movement.confirm + team.finance.read) — reserved for the
--                                semi-manual mid-session revocation procedure; the automated tests never use it
insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values
  ('00000000-0000-4000-8000-0000000000fa', 'Teste Inativo I', 'Africa/Luanda', 'AOA', 2, 'Kz') on conflict (id) do nothing;
insert into private.enrollment_codes (code_hash, organization_id, label, expires_at, max_uses) values
  (encode(extensions.digest('TEST-ORG-INATIVO-2026', 'sha256'), 'hex'), '00000000-0000-4000-8000-0000000000fa', 'Test device Inativo', '2027-12-31', 100000)
on conflict (code_hash) do nothing;
insert into public.payment_methods (id, organization_id, code, label, sort_order) values
  ('00000000-0000-4000-8000-00000000faa0', '00000000-0000-4000-8000-0000000000fa', 'numerario', 'Numerário', 1) on conflict (id) do nothing;
insert into public.people (id, organization_id, display_name, active) values
  ('00000000-0000-4000-8000-00000000fab1', '00000000-0000-4000-8000-0000000000fa', 'Profissional Inativo-I', true),
  ('00000000-0000-4000-8000-00000000fab2', '00000000-0000-4000-8000-0000000000fa', 'Gestora Ativa', true),
  ('00000000-0000-4000-8000-00000000fab3', '00000000-0000-4000-8000-0000000000fa', 'Pessoa Inativa', false),
  ('00000000-0000-4000-8000-00000000fab4', '00000000-0000-4000-8000-0000000000fa', 'Gestor Manual', true)
on conflict (id) do nothing;
insert into public.person_capabilities (organization_id, person_id, label, sort_order) values
  ('00000000-0000-4000-8000-0000000000fa', '00000000-0000-4000-8000-00000000fab1', 'Cabelo', 1) on conflict do nothing;
insert into private.person_secrets (person_id, organization_id, secret_hash) values
  ('00000000-0000-4000-8000-00000000fab2', '00000000-0000-4000-8000-0000000000fa', extensions.crypt('919191', extensions.gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-00000000fab3', '00000000-0000-4000-8000-0000000000fa', extensions.crypt('929292', extensions.gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-00000000fab4', '00000000-0000-4000-8000-0000000000fa', extensions.crypt('939393', extensions.gen_salt('bf', 8)))
on conflict (person_id) do nothing;
insert into private.person_permissions (organization_id, person_id, permission)
select '00000000-0000-4000-8000-0000000000fa', p, perm
  from (values ('00000000-0000-4000-8000-00000000fab2'::uuid), ('00000000-0000-4000-8000-00000000fab3'::uuid), ('00000000-0000-4000-8000-00000000fab4'::uuid)) a(p),
       (values ('movement.confirm'), ('team.finance.read')) b(perm)
on conflict do nothing;
