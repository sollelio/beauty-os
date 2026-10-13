-- Gestão · catalogue management. Synthetic, not pilot data.
-- "Teste Catálogo G" (code TEST-ORG-G-2026), used by tests/db/catalogue.test.ts.
--   88a1 Gestor Catálogo G: catalogue.manage + manager permissions, PIN 818181
--   88a2 Finanças G: team.finance.read · business.health.read · payment.confirm (read-only on the catalogue), PIN 828282
--   88a3 Profissional G: no permission, PIN 838383
-- One historical service record (captured at 4.500 while the price was 5.000) and one historical purchase of
-- 2 × unid. for 3.000; the tests change the catalogue and check that both stay as recorded.
insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values
  ('00000000-0000-4000-8000-0000000000f5', 'Teste Catálogo G', 'Africa/Luanda', 'AOA', 2, 'Kz') on conflict (id) do nothing;
insert into private.enrollment_codes (code_hash, organization_id, label, expires_at, max_uses) values
  (encode(extensions.digest('TEST-ORG-G-2026', 'sha256'), 'hex'), '00000000-0000-4000-8000-0000000000f5', 'Test device G', '2027-12-31', 100000) on conflict (code_hash) do nothing;
insert into public.payment_methods (id, organization_id, code, label, sort_order) values
  ('00000000-0000-4000-8000-0000000088a0', '00000000-0000-4000-8000-0000000000f5', 'numerario', 'Numerário', 1) on conflict (id) do nothing;
insert into public.services (id, organization_id, name, default_price_minor, sort_order) values
  ('00000000-0000-4000-8000-0000000088b1', '00000000-0000-4000-8000-0000000000f5', 'Serviço G Histórico', 500000, 1),
  ('00000000-0000-4000-8000-0000000088b2', '00000000-0000-4000-8000-0000000000f5', 'Serviço G Dois', 200000, 2) on conflict (id) do nothing;
insert into public.unit_words (organization_id, word, sort_order) values ('00000000-0000-4000-8000-0000000000f5', 'unid.', 1) on conflict do nothing;
insert into public.products (id, organization_id, name, unit_word) values
  ('00000000-0000-4000-8000-0000000088e1', '00000000-0000-4000-8000-0000000000f5', 'Produto G Histórico', 'unid.') on conflict do nothing;
insert into public.people (id, organization_id, display_name) values
  ('00000000-0000-4000-8000-0000000088a1', '00000000-0000-4000-8000-0000000000f5', 'Gestor Catálogo G'),
  ('00000000-0000-4000-8000-0000000088a2', '00000000-0000-4000-8000-0000000000f5', 'Finanças G'),
  ('00000000-0000-4000-8000-0000000088a3', '00000000-0000-4000-8000-0000000000f5', 'Profissional G') on conflict (id) do nothing;
insert into public.person_capabilities (organization_id, person_id, label, sort_order) values
  ('00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-0000000088a3', 'Unhas', 1) on conflict do nothing;
insert into private.person_secrets (person_id, organization_id, secret_hash) values
  ('00000000-0000-4000-8000-0000000088a1', '00000000-0000-4000-8000-0000000000f5', extensions.crypt('818181', extensions.gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-0000000088a2', '00000000-0000-4000-8000-0000000000f5', extensions.crypt('828282', extensions.gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-0000000088a3', '00000000-0000-4000-8000-0000000000f5', extensions.crypt('838383', extensions.gen_salt('bf', 8))) on conflict (person_id) do nothing;
insert into private.person_permissions (organization_id, person_id, permission)
select '00000000-0000-4000-8000-0000000000f5'::uuid, p::uuid, perm
  from (values ('00000000-0000-4000-8000-0000000088a1', 'catalogue.manage'), ('00000000-0000-4000-8000-0000000088a1', 'movement.confirm'),
               ('00000000-0000-4000-8000-0000000088a1', 'team.finance.read'), ('00000000-0000-4000-8000-0000000088a1', 'business.health.read'),
               ('00000000-0000-4000-8000-0000000088a2', 'team.finance.read'), ('00000000-0000-4000-8000-0000000088a2', 'business.health.read'),
               ('00000000-0000-4000-8000-0000000088a2', 'payment.confirm')) x(p, perm)
on conflict do nothing;

insert into public.service_records (id, organization_id, person_id, service_id, value_minor, payment_kind, occurred_at, recorded_at, device_id, command_id) values
  ('00000000-0000-4000-8000-0000000088c1', '00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-0000000088a3',
   '00000000-0000-4000-8000-0000000088b1', 450000, 'single', '2026-01-05 10:00+01', '2026-01-05 10:00+01', '00000000-0000-4000-8000-00000008aede',
   '00000000-0000-4000-8000-0000000088c2') on conflict (id) do nothing;
insert into public.service_record_payments (service_record_id, organization_id, payment_method_id, amount_minor) values
  ('00000000-0000-4000-8000-0000000088c1', '00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-0000000088a0', 450000) on conflict do nothing;
insert into public.purchases (id, organization_id, total_minor, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id) values
  ('00000000-0000-4000-8000-0000000088d1', '00000000-0000-4000-8000-0000000000f5', 300000, '2026-01-05 11:00+01', '2026-01-05 11:00+01',
   '00000000-0000-4000-8000-00000008aede', '00000000-0000-4000-8000-0000000088a1', '00000000-0000-4000-8000-0000000088d2') on conflict (id) do nothing;
insert into public.purchase_lines (purchase_id, organization_id, product_id, quantity, unit_word, line_cost_minor, position)
select '00000000-0000-4000-8000-0000000088d1', '00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-0000000088e1', 2, 'unid.', 300000, 1
 where not exists (select 1 from public.purchase_lines where purchase_id = '00000000-0000-4000-8000-0000000088d1');
insert into public.purchase_contributions (purchase_id, organization_id, contributor_kind, person_id, amount_minor)
select '00000000-0000-4000-8000-0000000088d1', '00000000-0000-4000-8000-0000000000f5', 'salon', null, 300000
 where not exists (select 1 from public.purchase_contributions where purchase_id = '00000000-0000-4000-8000-0000000088d1');
