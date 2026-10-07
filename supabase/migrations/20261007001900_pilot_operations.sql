-- Pilot hardening 01 · operator procedures and ADR-0009 mitigations 2, 4 (cleanup), 5.
-- Configuration UIs are not designed (07 I6–I8). For the pilot, a few security-relevant operations run as
-- operator procedures from the Supabase SQL editor (role postgres). They live in the `private` schema, which the
-- API does not expose, so no browser principal can call them. Every one writes the security audit (ADR-0007).
-- See docs/operations/pilot-runbook.md.

-- Security audit for operator actions (never secrets).
create table private.security_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null default current_user,
  action text not null,
  organization_id uuid,
  subject uuid,
  detail jsonb not null default '{}'::jsonb
);
revoke all on private.security_audit from public, anon, authenticated;

create or replace function private.audit(p_action text, p_org uuid, p_subject uuid, p_detail jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into private.security_audit (action, organization_id, subject, detail) values (p_action, p_org, p_subject, p_detail)
$$;

-- Enrollment code: random, single-use by default, short-lived; the plaintext is returned once and never stored.
create or replace function private.admin_issue_enrollment_code(p_org uuid, p_label text, p_expires_in interval default interval '24 hours', p_max_uses int default 1)
returns text language plpgsql security definer set search_path = '' as $$
declare v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; v_bytes bytea := extensions.gen_random_bytes(12); v_code text := ''; i int;
begin
  if not exists (select 1 from public.organizations where id = p_org) or coalesce(trim(p_label), '') = ''
     or p_expires_in <= interval '0' or p_expires_in > interval '30 days' or p_max_uses not between 1 and 20 then
    raise exception 'VALIDATION_FAILED';
  end if;
  for i in 0..11 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
    if i in (3, 7) then v_code := v_code || '-'; end if;
  end loop;
  insert into private.enrollment_codes (code_hash, organization_id, label, expires_at, max_uses)
  values (encode(extensions.digest(v_code, 'sha256'), 'hex'), p_org, trim(p_label), now() + p_expires_in, p_max_uses);
  perform private.audit('enrollment_code_issued', p_org, null, jsonb_build_object('label', trim(p_label), 'expires_in', p_expires_in::text, 'max_uses', p_max_uses));
  return v_code;
end $$;

create or replace function private.admin_revoke_enrollment_codes(p_org uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  update private.enrollment_codes set revoked_at = now() where organization_id = p_org and revoked_at is null and expires_at > now();
  get diagnostics v_n = row_count;
  perform private.audit('enrollment_codes_revoked', p_org, null, jsonb_build_object('count', v_n));
  return v_n;
end $$;

create or replace function private.admin_list_devices(p_org uuid)
returns table (device_id uuid, label text, enrolled_at timestamptz, revoked_at timestamptz, last_sign_in_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select d.id, d.label, d.enrolled_at, d.revoked_at, u.last_sign_in_at
    from private.devices d left join auth.users u on u.id = d.auth_user_id
   where d.organization_id = p_org order by d.enrolled_at desc
$$;

-- Lost / replaced device: the binding is revoked (effective on the next request, ADR-0009 mitigation 2) and its
-- open grants end. The device's records stay attributed to it.
create or replace function private.admin_revoke_device(p_device_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'VALIDATION_FAILED'; end if;
  update private.devices set revoked_at = now() where id = p_device_id and revoked_at is null returning organization_id into v_org;
  if v_org is null then raise exception 'NOT_FOUND'; end if;
  update private.verification_grants set revoked_at = now() where device_id = p_device_id and revoked_at is null;
  perform private.audit('device_revoked', v_org, p_device_id, jsonb_build_object('reason', trim(p_reason)));
end $$;

-- PIN: digits only. Length bounds are the current provisional range of the app (4–12); see the runbook.
create or replace function private.admin_set_person_secret(p_person uuid, p_pin text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.people where id = p_person and active;
  if v_org is null then raise exception 'NOT_FOUND'; end if;
  if p_pin !~ '^[0-9]{4,12}$' then raise exception 'VALIDATION_FAILED'; end if;
  insert into private.person_secrets (person_id, organization_id, secret_hash)
  values (p_person, v_org, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)))
  on conflict (person_id) do update set secret_hash = excluded.secret_hash, failed_count = 0, window_started_at = null, locked_until = null;
  perform private.audit('person_secret_set', v_org, p_person);
end $$;

create or replace function private.admin_set_permission(p_person uuid, p_permission text, p_granted boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.people where id = p_person;
  if v_org is null then raise exception 'NOT_FOUND'; end if;
  if p_permission not in ('movement.confirm', 'team.finance.read', 'period.decide', 'payment.confirm', 'period.close', 'period.reopen') then
    raise exception 'VALIDATION_FAILED';
  end if;
  if p_granted then
    insert into private.person_permissions (organization_id, person_id, permission) values (v_org, p_person, p_permission) on conflict do nothing;
  else
    delete from private.person_permissions where person_id = p_person and permission = p_permission;
  end if;
  perform private.audit(case when p_granted then 'permission_granted' else 'permission_revoked' end, v_org, p_person, jsonb_build_object('permission', p_permission));
end $$;

-- Periods are explicit (07 §10.3); their bounds are the owner's choice (P6). No overlap within an organization.
create or replace function private.admin_create_period(p_org uuid, p_label text, p_starts date, p_ends date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if coalesce(trim(p_label), '') = '' or p_ends < p_starts
     or exists (select 1 from public.periods where organization_id = p_org and daterange(starts_on, ends_on, '[]') && daterange(p_starts, p_ends, '[]')) then
    raise exception 'VALIDATION_FAILED';
  end if;
  insert into public.periods (organization_id, label, starts_on, ends_on) values (p_org, trim(p_label), p_starts, p_ends) returning id into v_id;
  perform private.audit('period_created', p_org, v_id, jsonb_build_object('label', trim(p_label), 'starts_on', p_starts, 'ends_on', p_ends));
  return v_id;
end $$;

-- Standing or contextual rule version for a person (D4; where it is configured is open, 07 I6).
create or replace function private.admin_set_rule(p_person uuid, p_kind text, p_percent numeric, p_effective_from date, p_set_by uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.people where id = p_person;
  if v_org is null or not exists (select 1 from public.people where id = p_set_by and organization_id = v_org) then raise exception 'NOT_FOUND'; end if;
  insert into public.rule_versions (organization_id, person_id, kind, percent, effective_from, set_by_person_id)
  values (v_org, p_person, p_kind, case when p_kind = 'standing' then p_percent end, p_effective_from, p_set_by);
  perform private.audit('rule_version_set', v_org, p_person, jsonb_build_object('kind', p_kind, 'percent', p_percent, 'effective_from', p_effective_from));
end $$;

-- ADR-0009 mitigation 4 (cleanup): anonymous Auth users that never bound to an organization hold no data and no
-- access; remove them after a grace period. Users bound to a device (revoked or not) are kept for attribution.
create or replace function private.cleanup_unbound_anonymous_users(p_older_than interval default interval '24 hours')
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  delete from auth.users u
   where u.is_anonymous and u.created_at < now() - p_older_than
     and not exists (select 1 from private.devices d where d.auth_user_id = u.id);
  get diagnostics v_n = row_count;
  if v_n > 0 then perform private.audit('anonymous_users_cleaned', null, null, jsonb_build_object('count', v_n)); end if;
  return v_n;
end $$;

revoke all on function private.audit(text, uuid, uuid, jsonb), private.admin_issue_enrollment_code(uuid, text, interval, int),
  private.admin_revoke_enrollment_codes(uuid), private.admin_list_devices(uuid), private.admin_revoke_device(uuid, text),
  private.admin_set_person_secret(uuid, text), private.admin_set_permission(uuid, text, boolean),
  private.admin_create_period(uuid, text, date, date), private.admin_set_rule(uuid, text, numeric, date, uuid),
  private.cleanup_unbound_anonymous_users(interval) from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('beauty-os-cleanup-unbound-anonymous-users', '17 3 * * *', $$select private.cleanup_unbound_anonymous_users()$$);

-- Self-test: exercise the procedures on a throwaway organization, then roll it all back.
do $$
declare v_org uuid := gen_random_uuid(); v_p uuid := gen_random_uuid(); v_code text; v_ok boolean;
begin
  begin
    insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values (v_org, 'selftest', 'UTC', 'XXX', 2, 'X');
    insert into public.people (id, organization_id, display_name) values (v_p, v_org, 'selftest');
    v_code := private.admin_issue_enrollment_code(v_org, 'selftest');
    if v_code !~ '^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$' then raise exception 'selftest: code format %', v_code; end if;
    if not exists (select 1 from private.enrollment_codes where code_hash = encode(extensions.digest(v_code, 'sha256'), 'hex') and max_uses = 1) then raise exception 'selftest: code not stored'; end if;
    perform private.admin_set_person_secret(v_p, '123456');
    select s.secret_hash = extensions.crypt('123456', s.secret_hash) into v_ok from private.person_secrets s where s.person_id = v_p;
    if not v_ok then raise exception 'selftest: secret'; end if;
    begin perform private.admin_set_person_secret(v_p, '12a4'); raise exception 'selftest: bad pin accepted';
    exception when others then if sqlerrm <> 'VALIDATION_FAILED' then raise; end if; end;
    perform private.admin_set_permission(v_p, 'period.close', true);
    if not exists (select 1 from private.person_permissions where person_id = v_p and permission = 'period.close') then raise exception 'selftest: permission'; end if;
    perform private.admin_set_permission(v_p, 'period.close', false);
    perform private.admin_create_period(v_org, 'P1', '2030-01-01', '2030-01-31');
    begin perform private.admin_create_period(v_org, 'P2', '2030-01-31', '2030-02-28'); raise exception 'selftest: overlap accepted';
    exception when others then if sqlerrm <> 'VALIDATION_FAILED' then raise; end if; end;
    perform private.admin_set_rule(v_p, 'standing', 50, '2030-01-01', v_p);
    if (select count(*) from private.security_audit where organization_id = v_org) < 5 then raise exception 'selftest: audit'; end if;
    perform private.cleanup_unbound_anonymous_users(interval '100 years');                  -- runs; nothing that old
    raise exception 'selftest_ok';
  exception when others then
    if sqlerrm <> 'selftest_ok' then raise; end if;
  end;
end $$;
