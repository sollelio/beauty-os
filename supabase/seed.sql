-- Synthetic development data for the Beauty OS Dev project. Not pilot data. Idempotent.
-- Applied with: npx supabase db push --include-seed
--
-- Organizations:
--   "Salão Demo (Dev)"        — for manual development use.   Enrollment code: DEV-SALAO-2026
--   "Teste Isolamento A/B"    — used only by the automated security tests (codes in tests/db/).
-- Currency/timezone values are organization settings chosen for this synthetic data, not product rules.

insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values
  ('00000000-0000-4000-8000-000000000d01', 'Salão Demo (Dev)',      'Africa/Luanda', 'AOA', 2, 'Kz'),
  ('00000000-0000-4000-8000-0000000000a1', 'Teste Isolamento A',    'Africa/Luanda', 'AOA', 2, 'Kz'),
  ('00000000-0000-4000-8000-0000000000b1', 'Teste Isolamento B',    'Africa/Luanda', 'AOA', 2, 'Kz')
on conflict (id) do nothing;

insert into public.payment_methods (id, organization_id, code, label, sort_order) values
  ('00000000-0000-4000-8000-00000000d101', '00000000-0000-4000-8000-000000000d01', 'numerario',     'Numerário',     1),
  ('00000000-0000-4000-8000-00000000d102', '00000000-0000-4000-8000-000000000d01', 'transferencia', 'Transferência', 2),
  ('00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-0000000000a1', 'numerario',     'Numerário',     1),
  ('00000000-0000-4000-8000-00000000a102', '00000000-0000-4000-8000-0000000000a1', 'transferencia', 'Transferência', 2),
  ('00000000-0000-4000-8000-00000000b101', '00000000-0000-4000-8000-0000000000b1', 'numerario',     'Numerário',     1),
  ('00000000-0000-4000-8000-00000000b102', '00000000-0000-4000-8000-0000000000b1', 'transferencia', 'Transferência', 2)
on conflict (id) do nothing;

insert into public.people (id, organization_id, display_name) values
  ('00000000-0000-4000-8000-00000000d201', '00000000-0000-4000-8000-000000000d01', 'Ana'),
  ('00000000-0000-4000-8000-00000000d202', '00000000-0000-4000-8000-000000000d01', 'Bruno'),
  ('00000000-0000-4000-8000-00000000d203', '00000000-0000-4000-8000-000000000d01', 'Carla'),
  ('00000000-0000-4000-8000-00000000d204', '00000000-0000-4000-8000-000000000d01', 'Duarte'),
  ('00000000-0000-4000-8000-00000000a201', '00000000-0000-4000-8000-0000000000a1', 'Pessoa Teste A'),
  ('00000000-0000-4000-8000-00000000b201', '00000000-0000-4000-8000-0000000000b1', 'Pessoa Teste B')
on conflict (id) do nothing;

insert into public.person_capabilities (organization_id, person_id, label, sort_order) values
  ('00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-00000000d201', 'Cabelo', 1),
  ('00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-00000000d201', 'Unhas', 2),
  ('00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-00000000d202', 'Barbearia', 1),
  ('00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-00000000d203', 'Unhas', 1),
  ('00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-00000000d203', 'Beleza', 2),
  ('00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-00000000d204', 'Cabelo', 1),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a201', 'Cabelo', 1),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000b201', 'Cabelo', 1)
on conflict do nothing;

-- prices in minor units (exponent 2): 350000 = 3.500 Kz
insert into public.services (id, organization_id, name, default_price_minor, sort_order) values
  ('00000000-0000-4000-8000-00000000d301', '00000000-0000-4000-8000-000000000d01', 'Corte',            350000, 1),
  ('00000000-0000-4000-8000-00000000d302', '00000000-0000-4000-8000-000000000d01', 'Barba',            200000, 2),
  ('00000000-0000-4000-8000-00000000d303', '00000000-0000-4000-8000-000000000d01', 'Brushing',         400000, 3),
  ('00000000-0000-4000-8000-00000000d304', '00000000-0000-4000-8000-000000000d01', 'Manicure',         300000, 4),
  ('00000000-0000-4000-8000-00000000d305', '00000000-0000-4000-8000-000000000d01', 'Manicure em gel',  600000, 5),
  ('00000000-0000-4000-8000-00000000d306', '00000000-0000-4000-8000-000000000d01', 'Pedicure',         300000, 6),
  ('00000000-0000-4000-8000-00000000d307', '00000000-0000-4000-8000-000000000d01', 'Coloração',        900000, 7),
  ('00000000-0000-4000-8000-00000000a301', '00000000-0000-4000-8000-0000000000a1', 'Serviço Teste A',  100000, 1),
  ('00000000-0000-4000-8000-00000000b301', '00000000-0000-4000-8000-0000000000b1', 'Serviço Teste B',  100000, 1)
on conflict (id) do nothing;

-- enrollment codes (sha256 of the upper-case code); multi-use for development devices and test runs
insert into private.enrollment_codes (code_hash, organization_id, label, expires_at, max_uses) values
  (encode(extensions.digest('DEV-SALAO-2026', 'sha256'), 'hex'),  '00000000-0000-4000-8000-000000000d01', 'Dev device',   '2027-12-31', 50),
  (encode(extensions.digest('TEST-ORG-A-2026', 'sha256'), 'hex'), '00000000-0000-4000-8000-0000000000a1', 'Test device A', '2027-12-31', 100000),
  (encode(extensions.digest('TEST-ORG-B-2026', 'sha256'), 'hex'), '00000000-0000-4000-8000-0000000000b1', 'Test device B', '2027-12-31', 100000)
on conflict (code_hash) do nothing;
