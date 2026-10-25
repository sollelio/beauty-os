-- ADR-0010 §5 amendment (Sollelio, 2026-10-25) · Slice 1: device purpose.
-- A bound device is `operational` (every existing device and every new enrollment: behaviour exactly as before) or
-- `support` (Sollelio support, diagnosis and administration inside one organization). A support device:
--   · stays bound to its organization and keeps every online capability its session has today (nothing is revoked);
--   · never holds offline work: its captures always take the server's time — a capture carrying a device-captured time
--     (a queued offline service, or a movement draft confirmed later) is refused with DEVICE_ONLINE_ONLY;
--   · never becomes offline-capable: its sync reports are answered and ignored, and becoming support clears the flag;
--   · is therefore outside the period-sync guard (private.period_device_sync, its per-device detail). No unguarded
--     device can hold offline work: the guard's required set is every active offline-capable operational device.
-- The purpose changes only through an audited operator procedure (no browser role can execute it). A device becomes
-- support only if its last sync report held no work; it becomes operational again through its next report (the
-- normal, audited registration). Exactly-once is untouched: the journal replay is answered before the capture-time
-- check; RLS and grants are unchanged; PERIOD_OFFLINE_SYNC_PENDING and the absence of an override stay.

alter table private.devices add column purpose text not null default 'operational' check (purpose in ('operational', 'support'));

-- ---------- capture time (body of 20261015000100, plus: a support device captures online only) ----------
create or replace function private.capture_time(p_occurred_at timestamptz)
returns timestamptz language plpgsql stable security definer set search_path = '' as $$
begin
  if p_occurred_at is null then return now(); end if;
  if exists (select 1 from private.devices d join private.current_device() cd on cd.device_id = d.id where d.purpose = 'support') then
    raise exception 'DEVICE_ONLINE_ONLY';
  end if;
  if p_occurred_at > now() + interval '5 minutes' then raise exception 'CAPTURE_TIME_IN_FUTURE'; end if;
  if p_occurred_at < now() - interval '48 hours' then raise exception 'CAPTURE_TIME_TOO_OLD'; end if;
  return p_occurred_at;
end $$;
revoke all on function private.capture_time(timestamptz) from public, anon, authenticated;

-- ---------- report_device_sync (body of 20261016000100, plus: a support device's report is answered and ignored) ----------
create or replace function public.report_device_sync(p_report jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_device uuid; v_org uuid; v_days jsonb; v_undated jsonb; v_now timestamptz := now(); v_first boolean;
begin
  select cd.device_id, cd.organization_id into v_device, v_org from private.current_device() cd;
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if exists (select 1 from private.devices d where d.id = v_device and d.purpose = 'support') then
    return jsonb_build_object('reported_at', v_now, 'offline_capture', false);   -- never offline-capable, never in the guard
  end if;
  if p_report is null or jsonb_typeof(p_report) <> 'object' or jsonb_typeof(coalesce(p_report -> 'days', '[]')) <> 'array'
     or jsonb_array_length(coalesce(p_report -> 'days', '[]')) > 400
     or (p_report ? 'undated' and jsonb_typeof(p_report -> 'undated') <> 'object') then
    raise exception 'VALIDATION_FAILED';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_report -> 'days', '[]')) e
              where jsonb_typeof(e) <> 'object' or (e ->> 'day') is null or (e ->> 'day') !~ '^\d{4}-\d{2}-\d{2}$') then
    raise exception 'VALIDATION_FAILED';
  end if;
  -- one row per day (summed), zero days dropped; an invalid date or count is refused
  select coalesce(jsonb_agg(jsonb_build_object('day', d, 'services', s, 'drafts', r, 'conflicts', c) order by d), '[]'::jsonb) into v_days
    from (select (e ->> 'day')::date::text d, sum(private.sync_count(e, 'services')) s, sum(private.sync_count(e, 'drafts')) r,
                 sum(private.sync_count(e, 'conflicts')) c
            from jsonb_array_elements(coalesce(p_report -> 'days', '[]')) e group by 1) x
   where s + r + c > 0;
  v_undated := jsonb_build_object('services', private.sync_count(coalesce(p_report -> 'undated', '{}'), 'services'),
                                  'drafts', private.sync_count(coalesce(p_report -> 'undated', '{}'), 'drafts'),
                                  'conflicts', private.sync_count(coalesce(p_report -> 'undated', '{}'), 'conflicts'));
  update private.devices set offline_capable_at = coalesce(offline_capable_at, v_now) where id = v_device
    returning offline_capable_at = v_now into v_first;
  if v_first then perform private.audit('device_offline_capable', v_org, v_device); end if;
  insert into private.device_sync_reports (device_id, organization_id, reported_at, days, undated)
  values (v_device, v_org, v_now, v_days, v_undated)
  on conflict (device_id) do update set reported_at = excluded.reported_at, days = excluded.days, undated = excluded.undated;
  return jsonb_build_object('reported_at', v_now);
end $$;
revoke all on function public.report_device_sync(jsonb) from public, anon;
grant execute on function public.report_device_sync(jsonb) to authenticated;

-- ---------- the guard (body of 20261016000100, plus: operational devices only) ----------
create or replace function private.period_device_sync(p_org uuid, p_period public.periods)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_end timestamptz; v_ready int := 0; v_pending int := 0; v_silent int := 0; d record;
begin
  select ((p_period.ends_on + 1)::timestamp at time zone o.timezone) into v_end from public.organizations o where o.id = p_org;
  for d in
    select r.reported_at, r.days, r.undated
      from private.devices v left join private.device_sync_reports r on r.device_id = v.id
     where v.organization_id = p_org and v.revoked_at is null and v.offline_capable_at is not null and v.purpose = 'operational'
  loop
    if d.reported_at is null or d.reported_at <= v_end then v_silent := v_silent + 1;
    elsif private.sync_count(d.undated, 'services') + private.sync_count(d.undated, 'drafts') + private.sync_count(d.undated, 'conflicts') > 0
       or exists (select 1 from jsonb_array_elements(d.days) e
                   where (e ->> 'day')::date between p_period.starts_on and p_period.ends_on) then v_pending := v_pending + 1;
    else v_ready := v_ready + 1;
    end if;
  end loop;
  return jsonb_build_object('ready', v_ready, 'pending', v_pending, 'silent', v_silent, 'safe', v_pending + v_silent = 0, 'period_ends_at', v_end);
end $$;
revoke all on function private.period_device_sync(uuid, public.periods) from public, anon, authenticated;

-- ---------- the guard's per-device detail (body of 20261025000100, plus: operational devices only) ----------
create or replace function private.period_device_sync_detail(p_org uuid, p_period public.periods)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_end timestamptz; v_me uuid; v_out jsonb := '[]'::jsonb; d record;
  v_services int; v_drafts int; v_conflicts int; v_in_period boolean; v_undated int; v_state text;
begin
  select ((p_period.ends_on + 1)::timestamp at time zone o.timezone) into v_end from public.organizations o where o.id = p_org;
  select cd.device_id into v_me from private.current_device() cd;
  for d in
    select v.id, v.label, v.enrolled_at, r.reported_at, r.days, r.undated
      from private.devices v left join private.device_sync_reports r on r.device_id = v.id
     where v.organization_id = p_org and v.revoked_at is null and v.offline_capable_at is not null and v.purpose = 'operational'
     order by v.label nulls last, v.enrolled_at
  loop
    select coalesce(sum(private.sync_count(e, 'services')), 0), coalesce(sum(private.sync_count(e, 'drafts')), 0),
           coalesce(sum(private.sync_count(e, 'conflicts')), 0), count(*) > 0
      into v_services, v_drafts, v_conflicts, v_in_period
      from jsonb_array_elements(coalesce(d.days, '[]'::jsonb)) e
     where (e ->> 'day')::date between p_period.starts_on and p_period.ends_on;
    v_undated := private.sync_count(d.undated, 'services') + private.sync_count(d.undated, 'drafts') + private.sync_count(d.undated, 'conflicts');
    -- exactly the order and predicates of private.period_device_sync
    if d.reported_at is null or d.reported_at <= v_end then v_state := 'silent';
    elsif v_undated > 0 or v_in_period then v_state := 'pending';
    else v_state := 'ready';
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'label', d.label, 'enrolled_at', d.enrolled_at, 'reported_at', d.reported_at, 'this_device', d.id = v_me, 'state', v_state,
      'services', v_services + private.sync_count(d.undated, 'services'),
      'drafts', v_drafts + private.sync_count(d.undated, 'drafts'),
      'conflicts', v_conflicts + private.sync_count(d.undated, 'conflicts')));
  end loop;
  return v_out;
end $$;
revoke all on function private.period_device_sync_detail(uuid, public.periods) from public, anon, authenticated;

-- ---------- device context (body of 20261017000300, plus: this device's purpose) ----------
create or replace function public.device_context()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object(
       'bound', true,
       'organization', jsonb_build_object(
         'id', o.id, 'name', o.name, 'timezone', o.timezone,
         'currency_code', o.currency_code, 'currency_exponent', o.currency_exponent, 'currency_symbol', o.currency_symbol,
         'logo', o.logo),
       'device', jsonb_build_object('purpose', d.purpose))
     from private.current_device() cd join public.organizations o on o.id = cd.organization_id join private.devices d on d.id = cd.device_id),
    jsonb_build_object('bound', false))
$$;

-- ---------- operator procedure: set a device's purpose (runbook §3) ----------
create or replace function private.admin_set_device_purpose(p_device_id uuid, p_purpose text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_d private.devices; v_r private.device_sync_reports;
begin
  if p_purpose is null or p_purpose not in ('operational', 'support') or coalesce(trim(p_reason), '') = '' then raise exception 'VALIDATION_FAILED'; end if;
  select * into v_d from private.devices where id = p_device_id and revoked_at is null for update;
  if v_d.id is null then raise exception 'NOT_FOUND'; end if;
  if v_d.purpose = p_purpose then return; end if;
  if p_purpose = 'support' then
    -- work the device reported holding would leave the guard with it: send, confirm or review it first
    select * into v_r from private.device_sync_reports where device_id = p_device_id;
    if v_r.device_id is not null and (jsonb_array_length(v_r.days) > 0
       or private.sync_count(v_r.undated, 'services') + private.sync_count(v_r.undated, 'drafts') + private.sync_count(v_r.undated, 'conflicts') > 0) then
      raise exception 'DEVICE_HAS_OFFLINE_WORK';
    end if;
    update private.devices set purpose = 'support', offline_capable_at = null where id = p_device_id;
  else
    update private.devices set purpose = 'operational' where id = p_device_id;   -- offline-capable again with its next report
  end if;
  perform private.audit('device_purpose_set', v_d.organization_id, p_device_id,
    jsonb_build_object('from', v_d.purpose, 'to', p_purpose, 'label', v_d.label, 'reason', trim(p_reason)));
end $$;
revoke all on function private.admin_set_device_purpose(uuid, text, text) from public, anon, authenticated;

-- Self-test on a throwaway organization, rolled back: the default, the guard's exclusion, the refusal with reported
-- work, the cleared capability, the audit, and the way back to operational.
do $$
declare v_org uuid := gen_random_uuid(); v_a uuid := gen_random_uuid(); v_b uuid := gen_random_uuid(); v_p public.periods; v_g jsonb;
begin
  begin
    insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values (v_org, 'selftest', 'UTC', 'XXX', 2, 'X');
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'selftest', date '2020-01-01', date '2020-01-07') returning * into v_p;
    insert into private.devices (id, organization_id, auth_user_id, label, offline_capable_at) values
      (v_a, v_org, gen_random_uuid(), 'selftest A', now()), (v_b, v_org, gen_random_uuid(), 'selftest B', now());
    if (select count(*) from private.devices where id in (v_a, v_b) and purpose = 'operational') <> 2 then raise exception 'selftest: default'; end if;
    insert into private.device_sync_reports (device_id, organization_id, reported_at, days, undated) values
      (v_a, v_org, now(), '[]', '{"services":0,"drafts":0,"conflicts":0}'),
      (v_b, v_org, now(), '[{"day":"2020-01-02","services":1,"drafts":0,"conflicts":0}]', '{"services":0,"drafts":0,"conflicts":0}');
    v_g := private.period_device_sync(v_org, v_p);
    if (v_g ->> 'ready')::int <> 1 or (v_g ->> 'pending')::int <> 1 then raise exception 'selftest: before %', v_g; end if;
    begin perform private.admin_set_device_purpose(v_b, 'support', 'selftest'); raise exception 'selftest: work accepted';
    exception when others then if sqlerrm <> 'DEVICE_HAS_OFFLINE_WORK' then raise; end if; end;
    perform private.admin_set_device_purpose(v_a, 'support', 'selftest');
    if (select offline_capable_at from private.devices where id = v_a) is not null then raise exception 'selftest: capability kept'; end if;
    v_g := private.period_device_sync(v_org, v_p);
    if (v_g ->> 'ready')::int <> 0 or (v_g ->> 'pending')::int <> 1
       or jsonb_array_length(private.period_device_sync_detail(v_org, v_p)) <> 1 then raise exception 'selftest: support counted %', v_g; end if;
    if not exists (select 1 from private.security_audit where action = 'device_purpose_set' and subject = v_a
                    and detail ->> 'from' = 'operational' and detail ->> 'to' = 'support') then raise exception 'selftest: audit'; end if;
    perform private.admin_set_device_purpose(v_a, 'support', 'selftest');                -- unchanged: no second event
    if (select count(*) from private.security_audit where action = 'device_purpose_set' and subject = v_a) <> 1 then raise exception 'selftest: repeated event'; end if;
    perform private.admin_set_device_purpose(v_a, 'operational', 'selftest');
    if (select purpose from private.devices where id = v_a) <> 'operational' or (select offline_capable_at from private.devices where id = v_a) is not null then
      raise exception 'selftest: back to operational';
    end if;
    raise exception 'selftest_ok';
  exception when others then
    if sqlerrm <> 'selftest_ok' then raise; end if;
  end;
end $$;
