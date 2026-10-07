-- Pilot corrections and permissions (synthetic Dev data).
-- 1. records.correct for the Dev confirmers and the test confirmers (a202 test A, c202 test C; a204 stays without it).
-- 2. "Salão Fecho (Dev)" mirrors the pilot permission matrix (docs/operations/pilot-permissions.sql):
--    Fernando: movement.confirm, team.finance.read, period.decide, period.close, period.reopen, records.correct
--    Mercy:    movement.confirm, team.finance.read, period.decide, payment.confirm, records.correct
insert into private.person_permissions (organization_id, person_id, permission) values
  ('00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-00000000d204', 'records.correct'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a202', 'records.correct'),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000c202', 'records.correct')
on conflict do nothing;

delete from private.person_permissions where organization_id = '00000000-0000-4000-8000-000000000f01'
  and person_id in ('00000000-0000-4000-8000-00000000f204', '00000000-0000-4000-8000-00000000f205');
insert into private.person_permissions (organization_id, person_id, permission)
select '00000000-0000-4000-8000-000000000f01', p::uuid, perm from (values
  ('00000000-0000-4000-8000-00000000f204', 'movement.confirm'), ('00000000-0000-4000-8000-00000000f204', 'team.finance.read'),
  ('00000000-0000-4000-8000-00000000f204', 'period.decide'), ('00000000-0000-4000-8000-00000000f204', 'period.close'),
  ('00000000-0000-4000-8000-00000000f204', 'period.reopen'), ('00000000-0000-4000-8000-00000000f204', 'records.correct'),
  ('00000000-0000-4000-8000-00000000f205', 'movement.confirm'), ('00000000-0000-4000-8000-00000000f205', 'team.finance.read'),
  ('00000000-0000-4000-8000-00000000f205', 'period.decide'), ('00000000-0000-4000-8000-00000000f205', 'payment.confirm'),
  ('00000000-0000-4000-8000-00000000f205', 'records.correct')) v(p, perm)
on conflict do nothing;
