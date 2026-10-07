-- Slice 04 · module `org`: the private-session scope of ADR-0009 (sensitive reads, Architecture Definition §7–§8).
-- A private_session grant authorizes sensitive reads only (never a one-shot command); it is bound to the device and
-- Auth session, expires, and ends on explicit exit. One active grant per scope and device session.

alter table private.verification_grants drop constraint verification_grants_scope_check;
alter table private.verification_grants add constraint verification_grants_scope_check check (scope in ('one_shot', 'private_session'));

drop function if exists public.verify_person(uuid, text);

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

-- The verified person of this device session's current private context, if any.
create or replace function private.current_private_person()
returns uuid language sql stable security definer set search_path = '' as $$
  select g.person_id
  from private.verification_grants g
  join private.current_device() cd on cd.device_id = g.device_id and cd.organization_id = g.organization_id
  where g.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
    and g.scope = 'private_session' and g.revoked_at is null and g.expires_at > now()
  order by g.created_at desc limit 1
$$;
revoke all on function private.current_private_person() from public, anon, authenticated;

create or replace function private.has_permission(p_person_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.person_permissions p
                  where p.person_id = p_person_id and p.permission = p_permission
                    and p.organization_id = (select private.current_org_id()))
$$;
revoke all on function private.has_permission(uuid, text) from public, anon, authenticated;

create or replace function public.private_context_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object(
       'active', true, 'person_id', p.id, 'display_name', p.display_name,
       'view', case when private.has_permission(p.id, 'team.finance.read') then 'manager' else 'self' end,
       'expires_at', (select max(g.expires_at) from private.verification_grants g
                       where g.person_id = p.id and g.scope = 'private_session' and g.revoked_at is null
                         and g.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid))
     from public.people p where p.id = (select private.current_private_person())),
    jsonb_build_object('active', false))
$$;

create or replace function public.end_private_context()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_device uuid; v_n int;
begin
  select cd.device_id into v_device from private.current_device() cd;
  if v_device is null then raise exception 'NOT_AUTHORIZED'; end if;
  update private.verification_grants set revoked_at = now()
   where device_id = v_device and session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
     and scope = 'private_session' and revoked_at is null;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'ended', v_n);
end $$;

-- People who can open a private context on this device (have a secret): names only.
create or replace function public.list_private_people()
returns table (id uuid, display_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name
  from public.people p join private.person_secrets s on s.person_id = p.id
  where p.organization_id = (select private.current_org_id()) and p.active
  order by p.display_name
$$;

revoke all on function public.verify_person(uuid, text, text), public.private_context_status(), public.end_private_context(),
  public.list_private_people() from public, anon;
grant execute on function public.verify_person(uuid, text, text), public.private_context_status(), public.end_private_context(),
  public.list_private_people() to authenticated;
