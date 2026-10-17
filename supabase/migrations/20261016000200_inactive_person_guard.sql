-- S1 · Inactive person authorization guard (personal-device hardening; ADR-0009 grants are revocable by
-- administrative action). An inactive person (public.people.active = false) can no longer verify a PIN, and no grant of
-- theirs authorizes anything — whichever way the person was deactivated (operator SQL today, organization configuration
-- later). Enforced at the four primitives every privileged path goes through:
--   · public.verify_person           — an inactive person is answered exactly like an unknown one (INVALID, no oracle,
--                                      no bcrypt, counted against the device); audited as 'person_inactive'
--   · private.consume_one_shot_grant — an outstanding one-shot grant of an inactive person is VERIFICATION_REQUIRED
--   · private.current_private_person — an inactive person's private context ends on the next request
--   · private.has_permission         — an inactive person holds no permission
-- Deactivation also revokes the person's outstanding grants (trigger) and is audited. PIN secrets and permission rows
-- stay dormant: reactivation (an administrative update) restores them; a revoked grant never comes back.
-- Contracts are unchanged: same signatures, return shapes and error codes; SECURITY DEFINER with an empty search_path;
-- the same execute grants. Idempotent replay (ADR-0006) is untouched: commands answer a replay before using a grant.

-- ---------- verify_person (body of 20261007001100, plus the inactive-person branch) ----------
create or replace function public.verify_person(p_person_id uuid, p_secret text, p_scope text default 'one_shot')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_device private.devices; v_org uuid; v_sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_secret private.person_secrets;
  c_max_person int := 5; c_max_device int := 10; c_window interval := interval '15 minutes';
  c_lock interval := interval '15 minutes'; c_ttl interval; v_grant_id uuid;
begin
  select cd.organization_id into v_org from private.current_device() cd;
  if v_org is null then return jsonb_build_object('ok', false, 'error', 'NOT_AUTHORIZED'); end if;
  if p_scope is null or p_scope not in ('one_shot', 'private_session') then return jsonb_build_object('ok', false, 'error', 'VALIDATION_FAILED'); end if;
  -- development lifetimes pending product input (05 §3): one action 120 s; private context 5 min
  c_ttl := case p_scope when 'one_shot' then interval '120 seconds' else interval '5 minutes' end;
  select d.* into v_device from private.devices d join private.current_device() cd on cd.device_id = d.id for update of d;

  if v_device.locked_until is not null and v_device.locked_until > now() then
    insert into private.verification_audit (organization_id, device_id, session_id, person_id, outcome)
    values (v_org, v_device.id, v_sid, p_person_id, 'device_locked');
    return jsonb_build_object('ok', false, 'error', 'LOCKED');
  end if;

  -- an inactive person of this organization: the same answer, cost and device counting as an unknown person
  if exists (select 1 from public.people p where p.id = p_person_id and p.organization_id = v_org and not p.active) then
    insert into private.verification_audit (organization_id, device_id, session_id, person_id, outcome)
    values (v_org, v_device.id, v_sid, p_person_id, 'person_inactive');
    update private.devices set
      failed_count = case when window_started_at is null or window_started_at < now() - c_window then 1 else failed_count + 1 end,
      window_started_at = case when window_started_at is null or window_started_at < now() - c_window then now() else window_started_at end,
      locked_until = case when (case when window_started_at is null or window_started_at < now() - c_window then 1 else failed_count + 1 end) >= c_max_device then now() + c_lock else locked_until end
     where id = v_device.id;
    return jsonb_build_object('ok', false, 'error', 'INVALID');
  end if;

  select s.* into v_secret from private.person_secrets s
   where s.person_id = p_person_id and s.organization_id = v_org for update;
  if v_secret.person_id is null then              -- unknown, other organization, or no secret: no oracle
    insert into private.verification_audit (organization_id, device_id, session_id, person_id, outcome)
    values (v_org, v_device.id, v_sid, null, 'unknown_person');
    update private.devices set
      failed_count = case when window_started_at is null or window_started_at < now() - c_window then 1 else failed_count + 1 end,
      window_started_at = case when window_started_at is null or window_started_at < now() - c_window then now() else window_started_at end,
      locked_until = case when (case when window_started_at is null or window_started_at < now() - c_window then 1 else failed_count + 1 end) >= c_max_device then now() + c_lock else locked_until end
     where id = v_device.id;
    return jsonb_build_object('ok', false, 'error', 'INVALID');
  end if;

  if v_secret.locked_until is not null and v_secret.locked_until > now() then
    insert into private.verification_audit (organization_id, device_id, session_id, person_id, outcome)
    values (v_org, v_device.id, v_sid, p_person_id, 'person_locked');
    return jsonb_build_object('ok', false, 'error', 'LOCKED');
  end if;

  if v_secret.secret_hash <> extensions.crypt(coalesce(p_secret, ''), v_secret.secret_hash) then
    update private.person_secrets set
      failed_count = case when window_started_at is null or window_started_at < now() - c_window then 1 else failed_count + 1 end,
      window_started_at = case when window_started_at is null or window_started_at < now() - c_window then now() else window_started_at end,
      locked_until = case when (case when window_started_at is null or window_started_at < now() - c_window then 1 else failed_count + 1 end) >= c_max_person then now() + c_lock else locked_until end
     where person_id = p_person_id;
    update private.devices set
      failed_count = case when window_started_at is null or window_started_at < now() - c_window then 1 else failed_count + 1 end,
      window_started_at = case when window_started_at is null or window_started_at < now() - c_window then now() else window_started_at end,
      locked_until = case when (case when window_started_at is null or window_started_at < now() - c_window then 1 else failed_count + 1 end) >= c_max_device then now() + c_lock else locked_until end
     where id = v_device.id;
    insert into private.verification_audit (organization_id, device_id, session_id, person_id, outcome)
    values (v_org, v_device.id, v_sid, p_person_id, 'failed');
    return jsonb_build_object('ok', false, 'error', 'INVALID');
  end if;

  update private.person_secrets set failed_count = 0, window_started_at = null where person_id = p_person_id;
  -- one active grant per scope and device session: a new verification supersedes any earlier one of the same scope
  update private.verification_grants set revoked_at = now()
   where device_id = v_device.id and session_id = v_sid and scope = p_scope and consumed_at is null and revoked_at is null;
  insert into private.verification_grants (organization_id, device_id, session_id, person_id, scope, expires_at)
  values (v_org, v_device.id, v_sid, p_person_id, p_scope, now() + c_ttl)
  returning id into v_grant_id;
  insert into private.verification_audit (organization_id, device_id, session_id, person_id, outcome)
  values (v_org, v_device.id, v_sid, p_person_id, 'granted_' || p_scope);
  return jsonb_build_object('ok', true, 'grant_id', v_grant_id, 'scope', p_scope, 'expires_in_s', extract(epoch from c_ttl)::int);
end $$;
revoke all on function public.verify_person(uuid, text, text) from public, anon;
grant execute on function public.verify_person(uuid, text, text) to authenticated;

-- ---------- consume_one_shot_grant (body of 20261007000700, plus: the grant's person is active) ----------
create or replace function private.consume_one_shot_grant(p_grant_id uuid, p_permission text, p_command_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_device uuid; v_org uuid; v_grant private.verification_grants;
begin
  select cd.device_id, cd.organization_id into v_device, v_org from private.current_device() cd;
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_grant_id is null then raise exception 'VERIFICATION_REQUIRED'; end if;
  select * into v_grant from private.verification_grants g
   where g.id = p_grant_id
     and g.device_id = v_device
     and g.organization_id = v_org
     and g.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
     and g.scope = 'one_shot' and g.consumed_at is null and g.revoked_at is null and g.expires_at > now()
     and exists (select 1 from public.people p where p.id = g.person_id and p.organization_id = v_org and p.active)
   for update;
  if v_grant.id is null then raise exception 'VERIFICATION_REQUIRED'; end if;
  if not exists (select 1 from private.person_permissions p
                  where p.person_id = v_grant.person_id and p.organization_id = v_org and p.permission = p_permission) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update private.verification_grants set consumed_at = now(), consumed_by_command = p_command_id where id = v_grant.id;
  return v_grant.person_id;
end $$;
revoke all on function private.consume_one_shot_grant(uuid, text, uuid) from public, anon, authenticated;

-- ---------- current_private_person (body of 20261007001100, plus: the grant's person is active) ----------
create or replace function private.current_private_person()
returns uuid language sql stable security definer set search_path = '' as $$
  select g.person_id
  from private.verification_grants g
  join private.current_device() cd on cd.device_id = g.device_id and cd.organization_id = g.organization_id
  where g.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
    and g.scope = 'private_session' and g.revoked_at is null and g.expires_at > now()
    and exists (select 1 from public.people p where p.id = g.person_id and p.organization_id = g.organization_id and p.active)
  order by g.created_at desc limit 1
$$;
revoke all on function private.current_private_person() from public, anon, authenticated;

-- ---------- has_permission (body of 20261007001100, plus: an inactive person holds no permission) ----------
create or replace function private.has_permission(p_person_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.person_permissions p
                  where p.person_id = p_person_id and p.permission = p_permission
                    and p.organization_id = (select private.current_org_id())
                    and exists (select 1 from public.people pe where pe.id = p.person_id and pe.organization_id = p.organization_id and pe.active))
$$;
revoke all on function private.has_permission(uuid, text) from public, anon, authenticated;

-- ---------- deactivation: outstanding grants are revoked, and the event is audited ----------
create or replace function private.people_deactivated()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  update private.verification_grants set revoked_at = now()
   where person_id = new.id and organization_id = new.organization_id and consumed_at is null and revoked_at is null;
  get diagnostics v_n = row_count;
  perform private.audit('person_deactivated', new.organization_id, new.id, jsonb_build_object('grants_revoked', v_n));
  return null;
end $$;
revoke all on function private.people_deactivated() from public, anon, authenticated;

drop trigger if exists people_deactivated on public.people;
create trigger people_deactivated after update of active on public.people
  for each row when (old.active and not new.active) execute function private.people_deactivated();

-- Self-test: deactivating a person revokes exactly their outstanding grants (open one-shot and private-session ones;
-- consumed grants and other people's grants untouched), audits it, and keeps the secret and permissions dormant.
-- Runs on a throwaway organization and rolls everything back.
do $$
declare v_org uuid := gen_random_uuid(); v_p uuid := gen_random_uuid(); v_q uuid := gen_random_uuid(); v_dev uuid := gen_random_uuid();
  v_open uuid; v_priv uuid; v_used uuid; v_other uuid;
begin
  begin
    insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values (v_org, 'selftest', 'UTC', 'XXX', 2, 'X');
    insert into public.people (id, organization_id, display_name) values (v_p, v_org, 'selftest p'), (v_q, v_org, 'selftest q');
    insert into private.person_secrets (person_id, organization_id, secret_hash) values (v_p, v_org, 'x');
    insert into private.person_permissions (organization_id, person_id, permission) values (v_org, v_p, 'movement.confirm');
    insert into private.devices (id, organization_id, auth_user_id, label) values (v_dev, v_org, gen_random_uuid(), 'selftest');
    insert into private.verification_grants (organization_id, device_id, session_id, person_id, scope, expires_at)
      values (v_org, v_dev, gen_random_uuid(), v_p, 'one_shot', now() + interval '2 minutes') returning id into v_open;
    insert into private.verification_grants (organization_id, device_id, session_id, person_id, scope, expires_at)
      values (v_org, v_dev, gen_random_uuid(), v_p, 'private_session', now() + interval '5 minutes') returning id into v_priv;
    insert into private.verification_grants (organization_id, device_id, session_id, person_id, scope, expires_at, consumed_at)
      values (v_org, v_dev, gen_random_uuid(), v_p, 'one_shot', now() + interval '2 minutes', now()) returning id into v_used;
    insert into private.verification_grants (organization_id, device_id, session_id, person_id, scope, expires_at)
      values (v_org, v_dev, gen_random_uuid(), v_q, 'one_shot', now() + interval '2 minutes') returning id into v_other;

    update public.people set display_name = 'selftest p2' where id = v_p;                -- not a deactivation: no effect
    if exists (select 1 from private.verification_grants where id in (v_open, v_priv) and revoked_at is not null) then raise exception 'selftest: revoked without deactivation'; end if;

    update public.people set active = false where id = v_p;
    if exists (select 1 from private.verification_grants where id in (v_open, v_priv) and revoked_at is null) then raise exception 'selftest: open grant not revoked'; end if;
    if exists (select 1 from private.verification_grants where id in (v_used, v_other) and revoked_at is not null) then raise exception 'selftest: wrong grant revoked'; end if;
    if not exists (select 1 from private.security_audit where action = 'person_deactivated' and organization_id = v_org and subject = v_p
                    and detail ->> 'grants_revoked' = '2') then raise exception 'selftest: audit'; end if;
    if not exists (select 1 from private.person_secrets where person_id = v_p)
       or not exists (select 1 from private.person_permissions where person_id = v_p) then raise exception 'selftest: secret or permission removed'; end if;

    update public.people set active = false where id = v_p;                               -- already inactive: no second event
    if (select count(*) from private.security_audit where action = 'person_deactivated' and subject = v_p) <> 1 then raise exception 'selftest: repeated event'; end if;
    update public.people set active = true where id = v_p;                                -- reactivation: grants stay revoked
    if exists (select 1 from private.verification_grants where id in (v_open, v_priv) and revoked_at is null) then raise exception 'selftest: grant revived'; end if;
    raise exception 'selftest_ok';
  exception when others then
    if sqlerrm <> 'selftest_ok' then raise; end if;
  end;
end $$;
