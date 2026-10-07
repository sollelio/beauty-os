-- Synthetic test data for the exact-grant fix: a second confirmer in "Teste Isolamento A" (PIN 555555). Idempotent.
insert into public.people (id, organization_id, display_name) values
  ('00000000-0000-4000-8000-00000000a204', '00000000-0000-4000-8000-0000000000a1', 'Confirmador 2 Teste A')
on conflict (id) do nothing;
insert into private.person_secrets (person_id, organization_id, secret_hash) values
  ('00000000-0000-4000-8000-00000000a204', '00000000-0000-4000-8000-0000000000a1', extensions.crypt('555555', extensions.gen_salt('bf', 8)))
on conflict (person_id) do nothing;
insert into private.person_permissions (organization_id, person_id, permission) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a204', 'movement.confirm')
on conflict do nothing;
