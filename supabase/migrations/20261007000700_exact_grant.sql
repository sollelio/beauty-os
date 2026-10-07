-- Slice 02 security fix: a sensitive command consumes only the exact one-shot grant its client obtained.
-- verify_person returns the grant id; record_advance receives it; the grant must still belong to the caller's
-- current device and Auth session and be one-shot, unconsumed, unrevoked and unexpired, otherwise
-- VERIFICATION_REQUIRED. A later verification by anyone (which supersedes the earlier grant) can therefore never
-- authorize an earlier retry. Idempotent replay (ADR-0006) is unchanged: it is answered before any grant is used.

drop function if exists public.record_advance(uuid, uuid, bigint, uuid, text, uuid);
drop function if exists private.take_one_shot_grant(text, uuid);

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

create or replace function public.verify_person(p_person_id uuid, p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_device private.devices; v_org uuid; v_sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_secret private.person_secrets;
  c_max_person int := 5; c_max_device int := 10; c_window interval := interval '15 minutes';
  c_lock interval := interval '15 minutes'; c_ttl interval := interval '120 seconds'; v_grant_id uuid;
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
  values (v_org, v_device.id, v_sid, p_person_id, 'one_shot', now() + c_ttl)
  returning id into v_grant_id;
  insert into private.verification_audit (organization_id, device_id, session_id, person_id, outcome)
  values (v_org, v_device.id, v_sid, p_person_id, 'granted_one_shot');
  return jsonb_build_object('ok', true, 'grant_id', v_grant_id, 'scope', 'one_shot', 'expires_in_s', extract(epoch from c_ttl)::int);
end $$;

create or replace function public.record_advance(
  p_command_id uuid,
  p_grant_id uuid,
  p_person_id uuid,
  p_amount_minor bigint,
  p_payment_method_id uuid,
  p_note text default null,
  p_declared_operator_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_device uuid; v_org uuid; v_uid uuid := auth.uid(); v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_fp text; v_journal private.command_journal; v_confirmer uuid; v_id uuid; v_now timestamptz := now(); v_result jsonb;
begin
  select cd.device_id, cd.organization_id into v_device, v_org from private.current_device() cd;
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or p_person_id is null or p_amount_minor is null or p_payment_method_id is null then
    raise exception 'VALIDATION_FAILED';
  end if;

  v_fp := md5(jsonb_build_object('type', 'record_advance', 'person', p_person_id, 'amount', p_amount_minor,
                                 'method', p_payment_method_id, 'note', v_note, 'declared', p_declared_operator_id)::text);

  -- idempotency first: a replay returns the original outcome without needing a fresh verification (ADR-0009 mitigation 10)
  perform pg_advisory_xact_lock(hashtextextended('cmd:' || p_command_id::text, 0));
  select * into v_journal from private.command_journal where command_id = p_command_id;
  if found then
    if v_journal.organization_id = v_org and v_journal.principal = v_uid
       and v_journal.command_type = 'record_advance' and v_journal.fingerprint = v_fp then
      return v_journal.result || jsonb_build_object('replayed', true);
    end if;
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;

  if not exists (select 1 from public.people p where p.id = p_person_id and p.organization_id = v_org and p.active)
     or not exists (select 1 from public.payment_methods m where m.id = p_payment_method_id and m.organization_id = v_org and m.active)
     or (p_declared_operator_id is not null
         and not exists (select 1 from public.people p where p.id = p_declared_operator_id and p.organization_id = v_org and p.active)) then
    raise exception 'CROSS_TENANT_REFERENCE';
  end if;
  if p_amount_minor <= 0 or char_length(coalesce(v_note, '')) > 60 then raise exception 'VALIDATION_FAILED'; end if;

  -- sensitive action: exactly the grant this client obtained, held by a person with the confirm permission (B2)
  v_confirmer := private.consume_one_shot_grant(p_grant_id, 'movement.confirm', p_command_id);

  insert into public.advances (organization_id, person_id, amount_minor, payment_method_id, note, occurred_at, recorded_at,
                               device_id, declared_operator_id, confirmed_by_person_id, command_id)
  values (v_org, p_person_id, p_amount_minor, p_payment_method_id, v_note, v_now, v_now,
          v_device, p_declared_operator_id, v_confirmer, p_command_id)
  returning id into v_id;

  v_result := jsonb_build_object('advance_id', v_id, 'occurred_at', v_now, 'confirmed_by_person_id', v_confirmer);
  insert into private.command_journal (command_id, organization_id, principal, command_type, fingerprint, result)
  values (p_command_id, v_org, v_uid, 'record_advance', v_fp, v_result);
  return v_result;
end $$;

revoke all on function public.record_advance(uuid, uuid, uuid, bigint, uuid, text, uuid) from public, anon;
grant execute on function public.record_advance(uuid, uuid, uuid, bigint, uuid, text, uuid) to authenticated;
