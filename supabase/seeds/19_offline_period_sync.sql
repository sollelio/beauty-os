-- Offline 7 · multi-device period sync safety. Synthetic, not pilot data. Used only by tests/db/offline_period_sync.test.ts.
-- "Teste Offline Sync" (TEST-ORG-SYNC-2026): one-day periods — a pool of past ones (2025-01-01 … 2026-09-30, all ended)
-- that the tests approve and close, and daily ones from 2026-10-01 on (the current day's period has not ended yet).
--   96b1 Profissional Sync · 96b2 Gestor Sync (every Fecho permission + movement.confirm, PIN 969696)
-- A revoked, offline-capable device with unsynced work: it must never count (a revoked device leaves the required set).
insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values
  ('00000000-0000-4000-8000-0000000000f9', 'Teste Offline Sync', 'Africa/Luanda', 'AOA', 2, 'Kz') on conflict (id) do nothing;
insert into private.enrollment_codes (code_hash, organization_id, label, expires_at, max_uses) values
  (encode(extensions.digest('TEST-ORG-SYNC-2026', 'sha256'), 'hex'), '00000000-0000-4000-8000-0000000000f9', 'Test device Sync', '2027-12-31', 100000)
on conflict (code_hash) do nothing;
insert into public.payment_methods (id, organization_id, code, label, sort_order) values
  ('00000000-0000-4000-8000-0000000096a0', '00000000-0000-4000-8000-0000000000f9', 'numerario', 'Numerário', 1) on conflict (id) do nothing;
insert into public.people (id, organization_id, display_name) values
  ('00000000-0000-4000-8000-0000000096b1', '00000000-0000-4000-8000-0000000000f9', 'Profissional Sync'),
  ('00000000-0000-4000-8000-0000000096b2', '00000000-0000-4000-8000-0000000000f9', 'Gestor Sync') on conflict (id) do nothing;
insert into public.person_capabilities (organization_id, person_id, label, sort_order) values
  ('00000000-0000-4000-8000-0000000000f9', '00000000-0000-4000-8000-0000000096b1', 'Cabelo', 1) on conflict do nothing;
insert into private.person_secrets (person_id, organization_id, secret_hash) values
  ('00000000-0000-4000-8000-0000000096b2', '00000000-0000-4000-8000-0000000000f9', extensions.crypt('969696', extensions.gen_salt('bf', 8)))
on conflict (person_id) do nothing;
insert into private.person_permissions (organization_id, person_id, permission)
select '00000000-0000-4000-8000-0000000000f9', '00000000-0000-4000-8000-0000000096b2', perm
  from (values ('team.finance.read'), ('movement.confirm'), ('period.decide'), ('payment.confirm'), ('period.close')) x(perm)
on conflict do nothing;
insert into public.services (id, organization_id, name, default_price_minor, sort_order) values
  ('00000000-0000-4000-8000-0000000096c1', '00000000-0000-4000-8000-0000000000f9', 'Serviço Sync', 100000, 1) on conflict (id) do nothing;
insert into public.periods (organization_id, label, starts_on, ends_on)
select '00000000-0000-4000-8000-0000000000f9', 'Sync ' || d::date, d::date, d::date
  from generate_series(date '2025-01-01', date '2027-12-31', interval '1 day') d
on conflict do nothing;
insert into private.devices (id, organization_id, auth_user_id, label, enrolled_at, revoked_at, offline_capable_at) values
  ('00000000-0000-4000-8000-0000000096d9', '00000000-0000-4000-8000-0000000000f9', '00000000-0000-4000-8000-0000000096e9', 'Telemóvel perdido (teste)',
   '2025-01-01', '2025-06-01', '2025-01-01') on conflict (id) do nothing;
insert into private.device_sync_reports (device_id, organization_id, reported_at, days, undated) values
  ('00000000-0000-4000-8000-0000000096d9', '00000000-0000-4000-8000-0000000000f9', '2025-05-01', '[]', '{"services": 3, "drafts": 1, "conflicts": 1}')
on conflict (device_id) do nothing;
