-- Slice 02 fix: a new verification on a device session supersedes any unused earlier one-shot grant,
-- so only the most recently verified person can authorize the next sensitive command.

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
  -- one active one-shot grant per device session: a new verification supersedes any unused earlier one
  update private.verification_grants set revoked_at = now()
   where device_id = v_device.id and session_id = v_sid and scope = 'one_shot' and consumed_at is null and revoked_at is null;
  insert into private.verification_grants (organization_id, device_id, session_id, person_id, scope, expires_at)
  values (v_org, v_device.id, v_sid, p_person_id, 'one_shot', now() + c_ttl);
  insert into private.verification_audit (organization_id, device_id, session_id, person_id, outcome)
  values (v_org, v_device.id, v_sid, p_person_id, 'granted_one_shot');
  return jsonb_build_object('ok', true, 'scope', 'one_shot', 'expires_in_s', extract(epoch from c_ttl)::int);
end $$;
