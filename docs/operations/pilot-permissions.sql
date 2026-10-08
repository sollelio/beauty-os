-- Pilot permission assignments (Sollelio operating decision, 2026-10-07). Run in the SQL editor of the pilot project
-- after the people exist (pilot-runbook.md §1). People are matched by their display name in the organization; check
-- the names (and their spelling) against the real people before running. Everyone not listed holds none of these
-- permissions; capture and the own situation (PIN only) stay as in the existing model.
--   Fernando: movement.confirm · team.finance.read · period.decide · period.close · period.reopen · records.correct
--   Mercy:    movement.confirm · team.finance.read · period.decide · payment.confirm · records.correct
--   Business Health (07 D9, Sollelio 2026-10-08): business.health.read for Fernando, Mercy and Duart
--   Duart: business.health.read only · other professionals: none
-- Fernando does NOT hold payment.confirm unless explicitly added later.
select private.admin_set_permission(p.id, x.permission, true)
  from public.people p
  join (values ('Fernando', 'movement.confirm'), ('Fernando', 'team.finance.read'), ('Fernando', 'period.decide'),
               ('Fernando', 'period.close'), ('Fernando', 'period.reopen'), ('Fernando', 'records.correct'),
               ('Mercy', 'movement.confirm'), ('Mercy', 'team.finance.read'), ('Mercy', 'period.decide'),
               ('Mercy', 'payment.confirm'), ('Mercy', 'records.correct'),
               ('Fernando', 'business.health.read'), ('Mercy', 'business.health.read'), ('Duart', 'business.health.read')) x(display_name, permission)
    on p.display_name = x.display_name
 where p.organization_id = :'org';

-- Check: exactly these rows, nothing else.
select p.display_name, pp.permission from private.person_permissions pp join public.people p on p.id = pp.person_id
 where pp.organization_id = :'org' order by 1, 2;
