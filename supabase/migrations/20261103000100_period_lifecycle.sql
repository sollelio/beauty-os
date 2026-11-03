-- Period lifecycle (Sollelio, 2026-11-03; Options A + C). A period is persisted 'aberto' until approved, but 'aberto'
-- alone no longer means operationally open:
--   · A — a period whose first day is after the organization's local today has NOT STARTED (scheduled), whatever its
--     state. It takes no Fecho decision (PERIOD_NOT_STARTED: approval, period rule, reserve allocation, owners' decision)
--     and is left out of the period lists people choose from (Fecho, Negócio, Situação). Nothing to activate: the date
--     makes it open. Capture already followed the date (a record goes to the period of its day, never in the future).
--   · C — periods are generated from the organization's schedule, so there is no future-coverage horizon:
--       - the schedule gains its first operating weekday (ISO: 1 = Monday), next to the last one and the usual closing
--         time (organization data, set by the audited operator procedure); a period runs from the first to the last
--         operating day of its week; the other days (Sunday for Monday–Saturday) stay uncovered;
--       - private.ensure_week_period(org, day): the period covering the day; else, when the schedule is complete, the day
--         is an operating day and nothing overlaps, the week is created ('Semana DD/MM–DD/MM', audited
--         'period_generated') — a concurrent creation of the same week is absorbed by unique (organization, starts_on);
--         else null (NO_PERIOD_FOR_DATE where a period is required, as before);
--       - capture: a record whose day has no period ensures its week in the same transaction (the period trigger);
--       - current week before any record: public.ensure_current_period(), a narrow idempotent command any device of the
--         organization may call, ensures today's week. Reads stay read-only (STABLE functions run in read-only
--         transactions): the app calls it before resolving the default period, so on Monday morning the Fecho opens on
--         the new week.
--     Only the event's or today's week is ever created; already created future periods are kept and are simply not
--     started until their first day.
--   · private.admin_remove_empty_period: an operator procedure removing a period only when it was never used (Aberto,
--     outside the capture window, no record of any kind on its days — cancelled ones included — and nothing referencing
--     it); audited 'period_removed' with a snapshot; the 'period_created' entry stays (the audit is append-only).
-- Unchanged: approval, payments, close, remuneration, Business Health comparisons, the sync guard, offline capture.

-- ---------- schedule: the first operating weekday ----------
alter table public.organizations
  add column week_first_operating_day smallint check (week_first_operating_day between 1 and 7),   -- ISO weekday: 1 = Monday
  add constraint organizations_week_days_order check (week_first_operating_day is null or week_last_operating_day is null
                                                      or week_first_operating_day <= week_last_operating_day);

-- the operator procedure with the first operating day (the 3-argument form stays: it leaves the first day as it is)
create or replace function private.admin_set_week_schedule(p_org uuid, p_first_operating_day smallint, p_last_operating_day smallint, p_usual_closing_time time)
returns void language plpgsql security definer set search_path = '' as $$
declare v_o public.organizations;
begin
  if (p_last_operating_day is null) <> (p_usual_closing_time is null) or p_last_operating_day not between 1 and 7
     or (p_first_operating_day is not null and (p_last_operating_day is null or p_first_operating_day not between 1 and p_last_operating_day)) then
    raise exception 'VALIDATION_FAILED';
  end if;
  select * into v_o from public.organizations where id = p_org for update;
  if v_o.id is null then raise exception 'NOT_FOUND'; end if;
  update public.organizations set week_first_operating_day = p_first_operating_day, week_last_operating_day = p_last_operating_day,
                                  usual_closing_time = p_usual_closing_time where id = p_org;
  perform private.audit('week_schedule_set', p_org, p_org, jsonb_build_object(
    'from', jsonb_build_object('first_operating_day', v_o.week_first_operating_day, 'last_operating_day', v_o.week_last_operating_day, 'usual_closing_time', v_o.usual_closing_time),
    'to', jsonb_build_object('first_operating_day', p_first_operating_day, 'last_operating_day', p_last_operating_day, 'usual_closing_time', p_usual_closing_time)));
end $$;
revoke all on function private.admin_set_week_schedule(uuid, smallint, smallint, time) from public, anon, authenticated;

-- ---------- A: started ----------
create or replace function private.period_started(p_period public.periods)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_period.starts_on <= (now() at time zone o.timezone)::date from public.organizations o where o.id = p_period.organization_id
$$;
revoke all on function private.period_started(public.periods) from public, anon, authenticated;

-- ---------- C: the week of a day, from the schedule ----------
create or replace function private.ensure_week_period(p_org uuid, p_day date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_o public.organizations; v_id uuid; v_dow int; v_start date; v_end date; v_label text;
begin
  select pe.id into v_id from public.periods pe where pe.organization_id = p_org and p_day between pe.starts_on and pe.ends_on
   order by pe.starts_on desc limit 1;
  if v_id is not null then return v_id; end if;
  select * into v_o from public.organizations where id = p_org;
  if v_o.week_first_operating_day is null or v_o.week_last_operating_day is null then return null; end if;   -- no schedule
  v_dow := extract(isodow from p_day)::int;
  if v_dow < v_o.week_first_operating_day or v_dow > v_o.week_last_operating_day then return null; end if;   -- not an operating day
  v_start := p_day - (v_dow - v_o.week_first_operating_day);
  v_end := p_day + (v_o.week_last_operating_day - v_dow);
  if exists (select 1 from public.periods pe where pe.organization_id = p_org
              and daterange(pe.starts_on, pe.ends_on, '[]') && daterange(v_start, v_end, '[]')) then return null; end if;   -- never overlap
  v_label := 'Semana ' || to_char(v_start, 'DD/MM') || '–' || to_char(v_end, 'DD/MM');
  insert into public.periods (organization_id, label, starts_on, ends_on) values (p_org, v_label, v_start, v_end)
  on conflict (organization_id, starts_on) do nothing returning id into v_id;
  if v_id is null then                                                   -- created by a concurrent transaction
    select pe.id into v_id from public.periods pe where pe.organization_id = p_org and pe.starts_on = v_start and pe.ends_on = v_end;
    return v_id;
  end if;
  perform private.audit('period_generated', p_org, v_id, jsonb_build_object('label', v_label, 'starts_on', v_start, 'ends_on', v_end));
  return v_id;
end $$;
revoke all on function private.ensure_week_period(uuid, date) from public, anon, authenticated;

create or replace function public.ensure_current_period()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_tz text;
begin
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  select o.timezone into v_tz from public.organizations o where o.id = v_org;
  return jsonb_build_object('ensured', private.ensure_week_period(v_org, (now() at time zone v_tz)::date) is not null);
end $$;
revoke all on function public.ensure_current_period() from public, anon;
grant execute on function public.ensure_current_period() to authenticated;

-- ---------- patches in place (abort unless each anchor occurs once) ----------
do $$
declare
  v_fn text; v_src text; v_a text; v_b text; v_pair text[];
  c_guard_a text := $a$if v_p.state = 'fechado' then raise exception 'PERIOD_CLOSED'; end if;$a$;
  c_guard_b text := $b$if v_p.state = 'fechado' then raise exception 'PERIOD_CLOSED'; end if;
  if not private.period_started(v_p) then raise exception 'PERIOD_NOT_STARTED'; end if;$b$;
  c_list_a text := $a$from public.periods pe where pe.organization_id = v_org), '[]'::jsonb);$a$;
  c_list_b text := $b$from public.periods pe where pe.organization_id = v_org and private.period_started(pe)), '[]'::jsonb);$b$;
begin
  foreach v_pair slice 1 in array array[
    -- A: no Fecho decision on a period that has not started
    ['public.approve_period(uuid,uuid,uuid,bigint)', c_guard_a, c_guard_b],
    ['public.decide_period_rule(uuid,uuid,uuid,uuid,numeric)', c_guard_a, c_guard_b],
    ['public.allocate_reserve(uuid,uuid,uuid,bigint,text)', c_guard_a, c_guard_b],
    ['public.record_owners_decision(uuid,uuid,uuid,text,bigint)', c_guard_a, c_guard_b],
    -- A: the period lists people choose from hold started periods only
    ['public.fecho_periods()', c_list_a, c_list_b],
    ['public.business_periods()', c_list_a, c_list_b],
    ['public.team_periods(uuid)', c_list_a, c_list_b],
    -- A: the Fecho does not offer approval before the period starts
    ['public.fecho_period(uuid)', $a$'can_approve', v_period.state = 'aberto' and jsonb_array_length(v_pos -> 'pending') = 0,$a$,
                                  $b$'can_approve', v_period.state = 'aberto' and jsonb_array_length(v_pos -> 'pending') = 0 and private.period_started(v_period),$b$],
    -- C: a record whose day has no period ensures its week (schedule permitting) in the same transaction
    ['private.touch_period_of_event()', $a$  if v_period is null then raise exception 'NO_PERIOD_FOR_DATE'; end if;     -- never outside the period model$a$,
                                        $b$  if v_period is null then   -- the week of the record's day, from the organization's schedule (none on a non-operating day)
    v_period := private.ensure_week_period(new.organization_id,
                  (new.occurred_at at time zone (select o.timezone from public.organizations o where o.id = new.organization_id))::date);
  end if;
  if v_period is null then raise exception 'NO_PERIOD_FOR_DATE'; end if;     -- never outside the period model$b$]] loop
    v_fn := v_pair[1]; v_a := v_pair[2]; v_b := v_pair[3];
    v_src := pg_get_functiondef(v_fn::regprocedure);
    if (length(v_src) - length(replace(v_src, v_a, ''))) / length(v_a) <> 1 then raise exception 'period lifecycle patch: % anchor not found once', v_fn; end if;
    execute replace(v_src, v_a, v_b);
  end loop;
end $$;

-- ---------- operator procedure: remove a period that was never used ----------
create or replace function private.admin_remove_empty_period(p_period_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_p public.periods; v_tz text; v_today date; v_uses jsonb; v_reason text := trim(coalesce(p_reason, ''));
begin
  if v_reason = '' or char_length(v_reason) > 200 then raise exception 'VALIDATION_FAILED'; end if;
  select * into v_p from public.periods where id = p_period_id for update;
  if v_p.id is null then raise exception 'NOT_FOUND'; end if;
  select o.timezone into v_tz from public.organizations o where o.id = v_p.organization_id;
  v_today := (now() at time zone v_tz)::date;
  if v_p.state <> 'aberto' then raise exception 'PERIOD_STATE_INVALID'; end if;
  -- a record may still be captured up to 48 hours back (private.capture_time): only a period that ended before that window
  if v_p.ends_on >= v_today - 2 then raise exception 'PERIOD_IN_CAPTURE_WINDOW'; end if;
  v_uses := jsonb_build_object(
    'services', (select count(*) from public.service_records r where r.organization_id = v_p.organization_id
                  and (r.occurred_at at time zone v_tz)::date between v_p.starts_on and v_p.ends_on),        -- cancelled ones included
    'advances', (select count(*) from public.advances a where a.organization_id = v_p.organization_id
                  and (a.occurred_at at time zone v_tz)::date between v_p.starts_on and v_p.ends_on),
    'expenses', (select count(*) from public.expenses e where e.organization_id = v_p.organization_id
                  and (e.occurred_at at time zone v_tz)::date between v_p.starts_on and v_p.ends_on),
    'purchases', (select count(*) from public.purchases u where u.organization_id = v_p.organization_id
                  and (u.occurred_at at time zone v_tz)::date between v_p.starts_on and v_p.ends_on),
    'cancellations', (select count(*) from public.record_cancellations c where c.period_id = v_p.id),
    'approvals', (select count(*) from public.period_approvals x where x.period_id = v_p.id),
    'payments', (select count(*) from public.payments x where x.period_id = v_p.id),
    'close_statements', (select count(*) from public.period_close_statements x where x.period_id = v_p.id),
    'transitions', (select count(*) from public.period_transitions x where x.period_id = v_p.id),
    'rule_decisions', (select count(*) from public.period_rule_decisions x where x.period_id = v_p.id),
    'owners_decisions', (select count(*) from public.owners_decisions x where x.period_id = v_p.id),
    'reserve_allocations', (select count(*) from public.reserve_allocations x where x.period_id = v_p.id),
    'reserve_uses', (select count(*) from public.reserve_uses x where x.period_id = v_p.id),
    'week_end_events', (select count(*) from public.period_week_end_events x where x.period_id = v_p.id));
  if exists (select 1 from jsonb_each(v_uses) e where (e.value)::bigint > 0) then
    raise exception 'PERIOD_NOT_EMPTY' using detail = v_uses::text;
  end if;
  delete from public.periods where id = v_p.id;            -- any other reference added later stops it here (foreign keys)
  perform private.audit('period_removed', v_p.organization_id, v_p.id, jsonb_build_object(
    'label', v_p.label, 'starts_on', v_p.starts_on, 'ends_on', v_p.ends_on, 'state', v_p.state, 'review_revision', v_p.review_revision,
    'created_at', v_p.created_at, 'reason', v_reason, 'checked', v_uses));
  return jsonb_build_object('removed', v_p.id, 'label', v_p.label);
end $$;
revoke all on function private.admin_remove_empty_period(uuid, text) from public, anon, authenticated;

-- Self-test on a throwaway organization, rolled back: Monday–Saturday schedule → a Wednesday ensures its Monday–Saturday
-- week once (idempotent, audited), a Sunday and a schedule-less organization get none, no overlap with an existing
-- period; started / not started by date; the removal procedure refuses a used period and removes an unused one.
do $$
declare v_org uuid := gen_random_uuid(); v_bare uuid := gen_random_uuid(); v_a uuid; v_b uuid; v_p public.periods; v_r jsonb;
begin
  begin
    insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values
      (v_org, 'selftest', 'Africa/Luanda', 'XXX', 2, 'X'), (v_bare, 'selftest bare', 'Africa/Luanda', 'XXX', 2, 'X');
    begin perform private.admin_set_week_schedule(v_org, 7::smallint, 6::smallint, time '20:00'); raise exception 'selftest: first after last';
    exception when others then if sqlerrm <> 'VALIDATION_FAILED' then raise; end if; end;
    perform private.admin_set_week_schedule(v_org, 1::smallint, 6::smallint, time '20:00');
    v_a := private.ensure_week_period(v_org, date '2020-01-08');                                   -- a Wednesday
    select * into v_p from public.periods where id = v_a;
    if v_p.starts_on <> date '2020-01-06' or v_p.ends_on <> date '2020-01-11' or v_p.label <> 'Semana 06/01–11/01' or v_p.state <> 'aberto' then raise exception 'selftest: week %', row_to_json(v_p); end if;
    if private.ensure_week_period(v_org, date '2020-01-11') is distinct from v_a then raise exception 'selftest: idempotent'; end if;
    if (select count(*) from private.security_audit where organization_id = v_org and action = 'period_generated') <> 1 then raise exception 'selftest: audit'; end if;
    if private.ensure_week_period(v_org, date '2020-01-12') is not null then raise exception 'selftest: Sunday'; end if;
    if private.ensure_week_period(v_bare, date '2020-01-08') is not null then raise exception 'selftest: no schedule'; end if;
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'manual', date '2020-01-15', date '2020-01-15');
    if private.ensure_week_period(v_org, date '2020-01-14') is not null then raise exception 'selftest: overlap'; end if;
    if not private.period_started(v_p) then raise exception 'selftest: started'; end if;
    v_p.starts_on := (now() at time zone 'Africa/Luanda')::date + 1;
    if private.period_started(v_p) then raise exception 'selftest: not started'; end if;
    -- removal: an unused past period goes (audited); a period with a cancelled record's day stays
    v_r := private.admin_remove_empty_period(v_a, 'selftest');
    if exists (select 1 from public.periods where id = v_a)
       or (select count(*) from private.security_audit where organization_id = v_org and action = 'period_removed') <> 1 then raise exception 'selftest: removal'; end if;
    select id into v_b from public.periods where organization_id = v_org and label = 'manual';
    insert into public.people (id, organization_id, display_name) values (v_bare, v_org, 'P');
    insert into public.period_week_end_events (organization_id, period_id, kind, at, person_id, early, usual_closing_at, command_id)
      values (v_org, v_b, 'declared', timestamptz '2020-01-15 19:00+01', v_bare, false, timestamptz '2020-01-15 20:00+01', gen_random_uuid());
    begin perform private.admin_remove_empty_period(v_b, 'selftest'); raise exception 'selftest: removed a used period';
    exception when others then if sqlerrm <> 'PERIOD_NOT_EMPTY' then raise; end if; end;
    raise exception 'selftest_ok';
  exception when others then
    if sqlerrm <> 'selftest_ok' then raise; end if;
  end;
end $$;
