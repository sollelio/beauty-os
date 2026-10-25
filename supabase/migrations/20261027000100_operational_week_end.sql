-- ADR-0010 §5 amendment (Sollelio, 2026-10-25) · Slice 2: operational week end.
-- An organization may have an operating schedule (its last operating weekday and usual closing time; organization data,
-- never product logic). On the period's last operating day (organization timezone), a period.decide holder may declare
-- the operational week ended — before the usual closing time only after an explicit confirmation in the app; the
-- server records whether it was early. Nothing is ever declared or closed by clock time.
--   · Records: public.period_week_end_events, append-only (declared / withdrawn; who, when, early, command). The latest
--     event of a period decides: a declaration is active until a later withdrawal. Nothing is overwritten or deleted.
--   · Operational end = the active declaration's time, otherwise the calendar end ((ends_on + 1) 00:00, org timezone).
--     The period-sync guard (private.period_device_sync, its per-device detail) uses it: every active offline-capable
--     operational device must report after it with nothing pending for the period. Support devices stay excluded.
--     PERIOD_OFFLINE_SYNC_PENDING, the absence of an override, foreground sync and exactly-once are unchanged.
--   · Input freeze: while a declaration is active, a new service, advance, expense or purchase of the period whose
--     business time (occurred_at) is after the declared end is rejected (PERIOD_WEEK_ENDED) — never moved to another
--     period. Work that happened before the end and is sent later (offline) is still accepted, so a phone holding it can
--     send it and become ready. Online captures take the server's time, so after the declaration they are rejected.
--   · Withdrawal (period.decide, period still Aberto) records a withdrawn event: the period accepts records again and
--     the week can be declared ended again. After approval the existing annulment rules apply.
--   · Organizations without a schedule, and every period without a declaration, behave exactly as before.

-- ---------- operating schedule (organization data) ----------
alter table public.organizations
  add column week_last_operating_day smallint check (week_last_operating_day between 1 and 7),   -- ISO weekday: 6 = Saturday
  add column usual_closing_time time,
  add constraint organizations_week_schedule_complete check ((week_last_operating_day is null) = (usual_closing_time is null));

-- ---------- declarations (append-only) ----------
create table public.period_week_end_events (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  organization_id uuid not null,
  period_id uuid not null,
  kind text not null check (kind in ('declared', 'withdrawn')),
  at timestamptz not null default now(),
  person_id uuid not null,                           -- the verified person (period.decide)
  early boolean,                                     -- declared before the usual closing time (declarations only)
  usual_closing_at timestamptz,                      -- the usual closing time it was compared with (declarations only)
  command_id uuid not null unique,
  foreign key (organization_id, period_id) references public.periods(organization_id, id),
  foreign key (organization_id, person_id) references public.people(organization_id, id),
  check ((kind = 'declared') = (early is not null and usual_closing_at is not null))
);
create index on public.period_week_end_events (period_id, seq);
alter table public.period_week_end_events enable row level security;
revoke all on public.period_week_end_events from public, anon, authenticated;

-- The active declaration's time for a period (its latest event is a declaration), or null.
create or replace function private.period_declared_end(p_period_id uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select e.at from (select w.kind, w.at from public.period_week_end_events w where w.period_id = p_period_id order by w.seq desc limit 1) e
   where e.kind = 'declared'
$$;
revoke all on function private.period_declared_end(uuid) from public, anon, authenticated;

-- Operational end: the active declaration, otherwise the calendar end in the organization's timezone.
create or replace function private.period_operational_end(p_period public.periods)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select coalesce(private.period_declared_end(p_period.id), (p_period.ends_on + 1)::timestamp at time zone o.timezone)
    from public.organizations o where o.id = p_period.organization_id
$$;
revoke all on function private.period_operational_end(public.periods) from public, anon, authenticated;

-- The period's week end as Fecho shows it (no figures).
create or replace function private.period_week_end(p_period public.periods)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_o public.organizations; v_last date; v_dow int; v_closing timestamptz; v_cal timestamptz; v_today date; v_e public.period_week_end_events;
begin
  select * into v_o from public.organizations where id = p_period.organization_id;
  v_cal := (p_period.ends_on + 1)::timestamp at time zone v_o.timezone;
  v_today := (now() at time zone v_o.timezone)::date;
  if v_o.week_last_operating_day is not null then
    v_dow := extract(isodow from p_period.ends_on)::int;
    v_last := p_period.ends_on - ((v_dow - v_o.week_last_operating_day + 7) % 7);
    if v_last < p_period.starts_on then v_last := null; end if;
  end if;
  if v_last is not null then v_closing := (v_last + v_o.usual_closing_time)::timestamp at time zone v_o.timezone; end if;
  select * into v_e from public.period_week_end_events w where w.period_id = p_period.id order by w.seq desc limit 1;
  if v_e.kind is distinct from 'declared' then v_e := null; end if;
  return jsonb_build_object(
    'available', v_last is not null,
    'last_operating_day', v_last,
    'usual_closing_at', v_closing,
    'calendar_end', v_cal,
    'declared', case when v_e.id is null then null else jsonb_build_object(
        'at', v_e.at, 'early', v_e.early, 'by', (select display_name from public.people where id = v_e.person_id)) end,
    'ended', v_e.id is not null or now() >= v_cal,
    'ended_by', case when v_e.id is not null then 'declaration' when now() >= v_cal then 'calendar' end,
    'too_early', v_last is not null and v_today < v_last,
    'can_declare', v_last is not null and p_period.state = 'aberto' and v_e.id is null and now() < v_cal and v_today >= v_last,
    'can_withdraw', v_e.id is not null and p_period.state = 'aberto');
end $$;
revoke all on function private.period_week_end(public.periods) from public, anon, authenticated;

-- ---------- Terminar a semana (period.decide, one-shot verification, exactly-once) ----------
create or replace function public.declare_week_end(p_command_id uuid, p_grant_id uuid, p_period_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_fp text; v_r jsonb; v_actor uuid; v_p public.periods; v_w jsonb; v_closing timestamptz;
  v_early boolean; v_rev bigint;
begin
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or p_period_id is null then raise exception 'VALIDATION_FAILED'; end if;
  v_fp := md5(jsonb_build_object('period', p_period_id)::text);
  v_r := private.cmd_replay(p_command_id, 'declare_week_end', v_fp); if v_r is not null then return v_r; end if;
  v_actor := private.consume_one_shot_grant(p_grant_id, 'period.decide', p_command_id);
  v_p := private.lock_period(v_org, p_period_id);
  if v_p.state = 'fechado' then raise exception 'PERIOD_CLOSED'; end if;
  if v_p.state <> 'aberto' then raise exception 'PERIOD_STATE_INVALID'; end if;
  v_w := private.period_week_end(v_p);
  if not (v_w ->> 'available')::boolean then raise exception 'WEEK_END_NOT_AVAILABLE'; end if;
  if (v_w ->> 'ended')::boolean then raise exception 'PERIOD_WEEK_ENDED'; end if;      -- already declared, or ended by the calendar
  if (v_w ->> 'too_early')::boolean then raise exception 'WEEK_END_TOO_EARLY'; end if;
  v_closing := (v_w ->> 'usual_closing_at')::timestamptz;
  v_early := now() < v_closing;
  insert into public.period_week_end_events (organization_id, period_id, kind, at, person_id, early, usual_closing_at, command_id)
  values (v_org, v_p.id, 'declared', now(), v_actor, v_early, v_closing, p_command_id);
  v_rev := private.touch_period(v_p.id);
  return private.cmd_done(p_command_id, 'declare_week_end', v_fp, jsonb_build_object('declared_at', now(), 'early', v_early,
           'declared_by_person_id', v_actor, 'review_revision', v_rev));
end $$;

-- ---------- Continuar a semana: withdraw the active declaration while the period is Aberto ----------
create or replace function public.withdraw_week_end(p_command_id uuid, p_grant_id uuid, p_period_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_fp text; v_r jsonb; v_actor uuid; v_p public.periods; v_rev bigint;
begin
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or p_period_id is null then raise exception 'VALIDATION_FAILED'; end if;
  v_fp := md5(jsonb_build_object('period', p_period_id)::text);
  v_r := private.cmd_replay(p_command_id, 'withdraw_week_end', v_fp); if v_r is not null then return v_r; end if;
  v_actor := private.consume_one_shot_grant(p_grant_id, 'period.decide', p_command_id);
  v_p := private.lock_period(v_org, p_period_id);
  if v_p.state = 'fechado' then raise exception 'PERIOD_CLOSED'; end if;
  if v_p.state <> 'aberto' then raise exception 'PERIOD_STATE_INVALID'; end if;        -- after approval: annul the approval first
  if private.period_declared_end(v_p.id) is null then raise exception 'WEEK_NOT_ENDED'; end if;
  insert into public.period_week_end_events (organization_id, period_id, kind, at, person_id, command_id)
  values (v_org, v_p.id, 'withdrawn', now(), v_actor, p_command_id);
  v_rev := private.touch_period(v_p.id);
  return private.cmd_done(p_command_id, 'withdraw_week_end', v_fp, jsonb_build_object('withdrawn_at', now(),
           'withdrawn_by_person_id', v_actor, 'review_revision', v_rev));
end $$;
revoke all on function public.declare_week_end(uuid, uuid, uuid), public.withdraw_week_end(uuid, uuid, uuid) from public, anon;
grant execute on function public.declare_week_end(uuid, uuid, uuid), public.withdraw_week_end(uuid, uuid, uuid) to authenticated;

-- ---------- input freeze (body of 20261007001800, plus: nothing after an active declared end) ----------
create or replace function private.touch_period_of_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_period uuid := private.period_for(new.organization_id, new.occurred_at); v_state text; v_end timestamptz;
begin
  if v_period is null then return null; end if;
  select state into v_state from public.periods where id = v_period for update;
  if v_state = 'fechado' then raise exception 'PERIOD_CLOSED'; end if;
  if v_state in ('pronto_para_pagamento', 'em_pagamento') then raise exception 'PERIOD_APPROVED'; end if;
  v_end := private.period_declared_end(v_period);
  if v_end is not null and new.occurred_at > v_end then raise exception 'PERIOD_WEEK_ENDED'; end if;
  perform private.touch_period(v_period);
  return null;
end $$;

-- ---------- the guard (body of 20261026000100, plus: the period's operational end) ----------
create or replace function private.period_device_sync(p_org uuid, p_period public.periods)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_end timestamptz; v_ready int := 0; v_pending int := 0; v_silent int := 0; d record;
begin
  v_end := private.period_operational_end(p_period);                -- the declared end of the week, or the calendar end
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

-- ---------- the guard's per-device detail (body of 20261026000100, plus: the period's operational end) ----------
create or replace function private.period_device_sync_detail(p_org uuid, p_period public.periods)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_end timestamptz; v_me uuid; v_out jsonb := '[]'::jsonb; d record;
  v_services int; v_drafts int; v_conflicts int; v_in_period boolean; v_undated int; v_state text;
begin
  v_end := private.period_operational_end(p_period);
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

-- ---------- Fecho sync status (body of 20261025000100, plus: the week end) ----------
create or replace function public.fecho_sync_status(p_period_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_p public.periods; v_sync jsonb; v_w jsonb;
begin
  perform private.require_finance_viewer();
  select * into v_p from public.periods where id = p_period_id and organization_id = v_org;
  if v_p.id is null then raise exception 'CROSS_TENANT_REFERENCE'; end if;
  v_sync := private.period_device_sync(v_org, v_p);
  v_w := private.period_week_end(v_p);
  return (v_sync - 'period_ends_at')
    || jsonb_build_object('period_ended', now() > (v_sync ->> 'period_ends_at')::timestamptz,
                          'devices', private.period_device_sync_detail(v_org, v_p),
                          'week_end', jsonb_build_object('available', v_w -> 'available', 'declared_at', v_w -> 'declared' -> 'at'));
end $$;
revoke all on function public.fecho_sync_status(uuid) from public, anon;
grant execute on function public.fecho_sync_status(uuid) to authenticated;

-- ---------- Fecho review and history: the week end (patched in place; abort unless each anchor occurs once) ----------
do $$
declare v_src text; v_a text;
begin
  v_src := pg_get_functiondef('public.fecho_period(uuid)'::regprocedure);
  v_a := $a$    'readiness', jsonb_build_object($a$;
  if (length(v_src) - length(replace(v_src, v_a, ''))) / length(v_a) <> 1 then raise exception 'week end patch: fecho_period anchor not found once'; end if;
  execute replace(v_src, v_a, $b$    'week_end', private.period_week_end(v_period),
$b$ || v_a);

  v_src := pg_get_functiondef('public.fecho_history(uuid)'::regprocedure);
  v_a := $a$select jsonb_build_object('kind', 'close', 'at', s.closed_at$a$;
  if (length(v_src) - length(replace(v_src, v_a, ''))) / length(v_a) <> 1 then raise exception 'week end patch: fecho_history anchor not found once'; end if;
  execute replace(v_src, v_a, $b$select jsonb_build_object('kind', case w.kind when 'declared' then 'week_end' else 'week_end_withdrawn' end, 'at', w.at, 'early', w.early, 'by', b.display_name)
      from public.period_week_end_events w join public.people b on b.id = w.person_id where w.period_id = v_period.id
    union all
    $b$ || v_a);
end $$;

-- ---------- operator procedure: an organization's operating schedule (runbook §1) ----------
create or replace function private.admin_set_week_schedule(p_org uuid, p_last_operating_day smallint, p_usual_closing_time time)
returns void language plpgsql security definer set search_path = '' as $$
declare v_o public.organizations;
begin
  if (p_last_operating_day is null) <> (p_usual_closing_time is null) or p_last_operating_day not between 1 and 7 then raise exception 'VALIDATION_FAILED'; end if;
  select * into v_o from public.organizations where id = p_org for update;
  if v_o.id is null then raise exception 'NOT_FOUND'; end if;
  update public.organizations set week_last_operating_day = p_last_operating_day, usual_closing_time = p_usual_closing_time where id = p_org;
  perform private.audit('week_schedule_set', p_org, p_org, jsonb_build_object(
    'from', jsonb_build_object('last_operating_day', v_o.week_last_operating_day, 'usual_closing_time', v_o.usual_closing_time),
    'to', jsonb_build_object('last_operating_day', p_last_operating_day, 'usual_closing_time', p_usual_closing_time)));
end $$;
revoke all on function private.admin_set_week_schedule(uuid, smallint, time) from public, anon, authenticated;

-- Self-test on a throwaway organization, rolled back: no schedule → unchanged; Monday–Sunday period with Saturday 20:00 →
-- the last operating day is the Saturday and the usual closing time is in the organization's timezone; the operational
-- end follows the latest event; the guard and the detail use it; the schedule procedure validates and audits.
do $$
declare v_org uuid := gen_random_uuid(); v_x uuid := gen_random_uuid(); v_p public.periods; v_q public.periods; v_w jsonb; v_cmd uuid;
begin
  begin
    insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values (v_org, 'selftest', 'Africa/Luanda', 'XXX', 2, 'X');
    insert into public.people (id, organization_id, display_name) values (v_x, v_org, 'selftest');
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'w', date '2020-01-06', date '2020-01-12') returning * into v_p;   -- Monday → Sunday
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'd', date '2020-01-14', date '2020-01-15') returning * into v_q;   -- Tuesday → Wednesday
    v_w := private.period_week_end(v_p);
    if (v_w ->> 'available')::boolean or private.period_operational_end(v_p) <> timestamptz '2020-01-13 00:00+01' then raise exception 'selftest: unscheduled %', v_w; end if;
    begin perform private.admin_set_week_schedule(v_org, 6::smallint, null); raise exception 'selftest: half schedule';
    exception when others then if sqlerrm <> 'VALIDATION_FAILED' then raise; end if; end;
    perform private.admin_set_week_schedule(v_org, 6::smallint, time '20:00');
    if not exists (select 1 from private.security_audit where action = 'week_schedule_set' and organization_id = v_org) then raise exception 'selftest: schedule audit'; end if;
    v_w := private.period_week_end(v_p);
    if v_w ->> 'last_operating_day' <> '2020-01-11' or (v_w ->> 'usual_closing_at')::timestamptz <> timestamptz '2020-01-11 20:00+01'
       or not (v_w ->> 'available')::boolean or (v_w ->> 'can_declare')::boolean then raise exception 'selftest: schedule %', v_w; end if;
    if (private.period_week_end(v_q) ->> 'available')::boolean then raise exception 'selftest: a period without its last operating day'; end if;
    v_cmd := gen_random_uuid();
    insert into public.period_week_end_events (organization_id, period_id, kind, at, person_id, early, usual_closing_at, command_id)
      values (v_org, v_p.id, 'declared', timestamptz '2020-01-11 18:30+01', v_x, true, timestamptz '2020-01-11 20:00+01', v_cmd);
    if private.period_operational_end(v_p) <> timestamptz '2020-01-11 18:30+01' or private.period_week_end(v_p) -> 'declared' ->> 'by' <> 'selftest'
       or (private.period_device_sync(v_org, v_p) ->> 'period_ends_at')::timestamptz <> timestamptz '2020-01-11 18:30+01' then raise exception 'selftest: declared end'; end if;
    insert into public.period_week_end_events (organization_id, period_id, kind, person_id, command_id) values (v_org, v_p.id, 'withdrawn', v_x, gen_random_uuid());
    if private.period_operational_end(v_p) <> timestamptz '2020-01-13 00:00+01' or private.period_week_end(v_p) -> 'declared' <> 'null'::jsonb then raise exception 'selftest: withdrawn'; end if;
    begin insert into public.period_week_end_events (organization_id, period_id, kind, person_id, command_id) values (v_org, v_p.id, 'declared', v_x, gen_random_uuid());
      raise exception 'selftest: a declaration without its early flag';
    exception when check_violation then null; end;
    raise exception 'selftest_ok';
  exception when others then
    if sqlerrm <> 'selftest_ok' then raise; end if;
  end;
end $$;
