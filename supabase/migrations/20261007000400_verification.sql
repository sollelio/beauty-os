-- Slice 02 · module `org`: verified actor for sensitive actions (ADR-0009, Alternative A).
-- Per-person permission grants (ADR-0002), one-way protected secrets, attempt counters with lockout,
-- database-held one-shot verification grants bound to device + Auth session, and a security audit.
-- Only the one-shot scope is needed in Slice 02; the private-session scope arrives with the first private view.

create table private.person_permissions (
  organization_id uuid not null,
  person_id uuid not null,
  permission text not null,                          -- e.g. 'movement.confirm' (boundary B2, 07 §8)
  granted_at timestamptz not null default now(),
  primary key (person_id, permission),
  foreign key (organization_id, person_id) references public.people(organization_id, id)
);

create table private.person_secrets (
  person_id uuid primary key,
  organization_id uuid not null,
  secret_hash text not null,                         -- bcrypt (pgcrypto); never readable by API roles
  failed_count int not null default 0,
  window_started_at timestamptz,
  locked_until timestamptz,
  foreign key (organization_id, person_id) references public.people(organization_id, id)
);

alter table private.devices
  add column failed_count int not null default 0,
  add column window_started_at timestamptz,
  add column locked_until timestamptz;

create table private.verification_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  device_id uuid not null references private.devices(id),
  session_id uuid not null,
  person_id uuid not null,
  scope text not null check (scope in ('one_shot')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_command uuid,
  revoked_at timestamptz,
  foreign key (organization_id, person_id) references public.people(organization_id, id)
);
create index on private.verification_grants (device_id, session_id);

-- Security audit (Architecture Definition §14): attempts and outcomes, never the secret.
create table private.verification_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  organization_id uuid,
  device_id uuid,
  session_id uuid,
  person_id uuid,
  outcome text not null
);

-- Consumes the current one-shot grant of this device session for a permission; raises if absent.
-- Called only by commands, inside their transaction (so a failed command leaves the grant unconsumed).
create or replace function private.take_one_shot_grant(p_permission text, p_command_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_device uuid; v_org uuid; v_grant private.verification_grants;
begin
  select cd.device_id, cd.organization_id into v_device, v_org from private.current_device() cd;
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  select * into v_grant from private.verification_grants g
   where g.device_id = v_device
     and g.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
     and g.scope = 'one_shot' and g.consumed_at is null and g.revoked_at is null and g.expires_at > now()
   order by g.created_at desc limit 1
   for update;
  if v_grant.id is null then raise exception 'VERIFICATION_REQUIRED'; end if;
  if not exists (select 1 from private.person_permissions p
                  where p.person_id = v_grant.person_id and p.organization_id = v_org and p.permission = p_permission) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update private.verification_grants set consumed_at = now(), consumed_by_command = p_command_id where id = v_grant.id;
  return v_grant.person_id;
end $$;
revoke all on function private.take_one_shot_grant(text, uuid) from public, anon, authenticated;

-- Verify a person's secret on this device. Failures are returned, not raised, so counters and audit commit
-- (ADR-0009 mitigation 3). Thresholds and lifetime are development values pending product input (05 §3).
create or replace function public.verify_person(p_person_id uuid, p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_device private.devices; v_org uuid; v_sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_secret private.person_secrets;
  c_max_person int := 5; c_max_device int := 10; c_window interval := interval '15 minutes';
  c_lock interval := interval '15 minutes'; c_ttl interval := interval '120 seconds';
begin
  select cd.organization_id into v_org from private.current_device() cd;
  if v_org is null then return jsonb_build_object('ok', false, 'error', 'NOT_AUTHORIZED'); end if;
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
  insert into private.verification_grants (organization_id, device_id, session_id, person_id, scope, expires_at)
  values (v_org, v_device.id, v_sid, p_person_id, 'one_shot', now() + c_ttl);
  insert into private.verification_audit (organization_id, device_id, session_id, person_id, outcome)
  values (v_org, v_device.id, v_sid, p_person_id, 'granted_one_shot');
  return jsonb_build_object('ok', true, 'scope', 'one_shot', 'expires_in_s', extract(epoch from c_ttl)::int);
end $$;

-- People who may confirm movements on this device's organization (names only), for the confirmation step.
create or replace function public.list_confirmers()
returns table (id uuid, display_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name
  from public.people p
  join private.person_permissions pp on pp.person_id = p.id and pp.permission = 'movement.confirm'
  join private.person_secrets s on s.person_id = p.id
  where p.organization_id = (select private.current_org_id()) and p.active
  order by p.display_name
$$;

revoke all on function public.verify_person(uuid, text), public.list_confirmers() from public, anon;
grant execute on function public.verify_person(uuid, text), public.list_confirmers() to authenticated;
