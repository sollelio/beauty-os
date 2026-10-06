-- Synthetic development data for Slice 02. Idempotent. Add new seed files instead of editing applied ones:
-- the CLI records each seed file once and does not re-run edited files.

-- ---------- Slice 02: confirmers, synthetic secrets, permissions ----------
-- Dev:  Duarte may confirm movements; development PIN 135790.
-- Test: "Confirmador Teste A/B" may confirm; "Pessoa Teste A" has a PIN but no permission;
--       "Bloqueio Teste A" exists only for the lockout test. Synthetic values only.
insert into public.people (id, organization_id, display_name) values
  ('00000000-0000-4000-8000-00000000a202', '00000000-0000-4000-8000-0000000000a1', 'Confirmador Teste A'),
  ('00000000-0000-4000-8000-00000000a203', '00000000-0000-4000-8000-0000000000a1', 'Bloqueio Teste A'),
  ('00000000-0000-4000-8000-00000000b202', '00000000-0000-4000-8000-0000000000b1', 'Confirmador Teste B')
on conflict (id) do nothing;

insert into private.person_secrets (person_id, organization_id, secret_hash) values
  ('00000000-0000-4000-8000-00000000d204', '00000000-0000-4000-8000-000000000d01', extensions.crypt('135790', extensions.gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-00000000a201', '00000000-0000-4000-8000-0000000000a1', extensions.crypt('111111', extensions.gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-00000000a202', '00000000-0000-4000-8000-0000000000a1', extensions.crypt('222222', extensions.gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-00000000a203', '00000000-0000-4000-8000-0000000000a1', extensions.crypt('333333', extensions.gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-00000000b202', '00000000-0000-4000-8000-0000000000b1', extensions.crypt('444444', extensions.gen_salt('bf', 8)))
on conflict (person_id) do nothing;

insert into private.person_permissions (organization_id, person_id, permission) values
  ('00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-00000000d204', 'movement.confirm'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a202', 'movement.confirm'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a203', 'movement.confirm'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000b202', 'movement.confirm')
on conflict do nothing;
