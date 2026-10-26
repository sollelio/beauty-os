-- Slice 4 (Sollelio, 2026-10-26): the financial period model may leave out non-operating days (a Monday–Saturday week),
-- so every operational record must fall inside a period — never silently outside it.
--   · Coverage: a service, advance, expense or purchase whose occurrence date (organization timezone) is in no period of
--     its organization is rejected (NO_PERIOD_FOR_DATE) — never accepted without a period, never moved to the previous
--     or next period, never re-dated. Enforced at the one shared attribution point (private.touch_period_of_event, the
--     insert trigger of the four tables), so the whole command rolls back: nothing is written and no one-shot grant is
--     consumed. Online and offline (a queued or draft capture is refused at sync and stays for review on the phone).
--   · Default period (private.resolve_period, used by Fecho, the team situation and Business Health when no period is
--     chosen): the period covering today; on an uncovered day (a closed Sunday) the most recent period that has already
--     started — the one that just ended — never a future period; none started: PERIOD_NOT_FOUND.
--   · Future periods to the schedule: private.admin_shorten_future_periods_to_schedule (operator only, audited) ends each
--     future, empty, untouched Aberto period on the organization's last operating day; everything else is listed as
--     skipped with its reason. A period's bounds never change once it means anything financially.

-- ---------- coverage: the shared attribution point (patched in place; abort unless the anchor occurs once) ----------
do $$
declare v_src text := pg_get_functiondef('private.touch_period_of_event()'::regprocedure);
        v_a text := $a$  if v_period is null then return null; end if;$a$;
begin
  if (length(v_src) - length(replace(v_src, v_a, ''))) / length(v_a) <> 1 then raise exception 'coverage patch: touch_period_of_event anchor not found once'; end if;
  execute replace(v_src, v_a, $b$  if v_period is null then raise exception 'NO_PERIOD_FOR_DATE'; end if;     -- never outside the period model$b$);

  v_src := pg_get_functiondef('private.resolve_period(uuid)'::regprocedure);
  v_a := $a$      select * into v_p from public.periods where organization_id = v_org order by starts_on desc limit 1;$a$;
  if (length(v_src) - length(replace(v_src, v_a, ''))) / length(v_a) <> 1 then raise exception 'coverage patch: resolve_period anchor not found once'; end if;
  execute replace(v_src, v_a, $b$      -- an uncovered day: the most recent period that has started (the one that just ended), never a future one
      select * into v_p from public.periods where organization_id = v_org and starts_on <= (now() at time zone v_tz)::date
       order by ends_on desc, starts_on desc limit 1;$b$);
end $$;

-- ---------- future periods to the organization's schedule (operator only) ----------
-- Eligible: Aberto, not started (starts after today in the organization's timezone), review revision 0, no record dated
-- inside it, no row of any table that refers to it (approvals, payments, decisions, reserve, transitions, close
-- statements, week-end events, cancellations, …). Its start is kept; its end becomes the last scheduled operating day
-- inside it. A label ending with the old end ("…–08/11") ends with the new one. p_apply = false (the default) changes
-- nothing and can run in a read-only transaction: the same report, for review.
create or replace function private.admin_shorten_future_periods_to_schedule(p_org uuid, p_reason text, p_apply boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_o public.organizations; v_today date; v_p public.periods; v_end date; v_skip text; v_label text; v_t text; v_used boolean;
  v_eligible jsonb := '[]'::jsonb; v_skipped jsonb := '[]'::jsonb;
begin
  if p_org is null or coalesce(trim(p_reason), '') = '' or p_apply is null then raise exception 'VALIDATION_FAILED'; end if;
  select * into v_o from public.organizations where id = p_org;
  if v_o.id is null then raise exception 'NOT_FOUND'; end if;
  if v_o.week_last_operating_day is null then raise exception 'WEEK_END_NOT_AVAILABLE'; end if;    -- no schedule
  v_today := (now() at time zone v_o.timezone)::date;

  for v_p in select * from public.periods where organization_id = p_org order by starts_on loop
    if p_apply then perform 1 from public.periods where id = v_p.id for update; end if;
    v_end := v_p.ends_on - ((extract(isodow from v_p.ends_on)::int - v_o.week_last_operating_day + 7) % 7);
    v_skip := case
      when v_end = v_p.ends_on then 'already_ends_on_operating_day'
      when v_end < v_p.starts_on then 'no_operating_day'
      when v_p.starts_on <= v_today then 'started'
      when v_p.state <> 'aberto' then 'not_open'
      when v_p.review_revision <> 0 then 'has_history'
    end;
    if v_skip is null and (
         exists (select 1 from public.service_records r where r.organization_id = p_org and (r.occurred_at at time zone v_o.timezone)::date between v_p.starts_on and v_p.ends_on)
      or exists (select 1 from public.advances r where r.organization_id = p_org and (r.occurred_at at time zone v_o.timezone)::date between v_p.starts_on and v_p.ends_on)
      or exists (select 1 from public.expenses r where r.organization_id = p_org and (r.occurred_at at time zone v_o.timezone)::date between v_p.starts_on and v_p.ends_on)
      or exists (select 1 from public.purchases r where r.organization_id = p_org and (r.occurred_at at time zone v_o.timezone)::date between v_p.starts_on and v_p.ends_on)) then
      v_skip := 'has_records';
    end if;
    if v_skip is null then
      for v_t in select c.table_name from information_schema.columns c
                  where c.table_schema = 'public' and c.column_name = 'period_id' order by c.table_name loop
        execute format('select exists (select 1 from public.%I where period_id = $1)', v_t) into v_used using v_p.id;
        if v_used then v_skip := 'has_history'; exit; end if;
      end loop;
    end if;

    if v_skip is not null then
      v_skipped := v_skipped || jsonb_build_object('period_id', v_p.id, 'label', v_p.label, 'starts_on', v_p.starts_on, 'ends_on', v_p.ends_on, 'reason', v_skip);
      continue;
    end if;
    v_label := case when right(v_p.label, 5) = to_char(v_p.ends_on, 'DD/MM') then left(v_p.label, -5) || to_char(v_end, 'DD/MM') else v_p.label end;
    v_eligible := v_eligible || jsonb_build_object('period_id', v_p.id, 'label', v_p.label, 'new_label', v_label, 'starts_on', v_p.starts_on,
                                                   'ends_on', v_p.ends_on, 'new_ends_on', v_end);
    if p_apply then
      update public.periods set ends_on = v_end, label = v_label where id = v_p.id;
      perform private.audit('period_shortened', p_org, v_p.id, jsonb_build_object('label', jsonb_build_object('from', v_p.label, 'to', v_label),
        'starts_on', v_p.starts_on, 'ends_on', jsonb_build_object('from', v_p.ends_on, 'to', v_end),
        'last_operating_day', v_o.week_last_operating_day, 'reason', trim(p_reason)));
    end if;
  end loop;
  return jsonb_build_object('applied', p_apply, 'today', v_today, 'last_operating_day', v_o.week_last_operating_day,
                            (case when p_apply then 'changed' else 'eligible' end), v_eligible, 'skipped', v_skipped);
end $$;
revoke all on function private.admin_shorten_future_periods_to_schedule(uuid, text, boolean) from public, anon, authenticated;

-- Self-test on a throwaway organization, rolled back: eligibility and every skip reason; a dry run changes nothing; the
-- application changes only the eligible period (start kept, end on the operating day, label), audited.
do $$
declare
  v_org uuid := gen_random_uuid(); v_x uuid := gen_random_uuid(); v_today date := (now() at time zone 'Africa/Luanda')::date;
  v_mon date; r jsonb; v_a uuid; v_b uuid; v_c uuid; v_d uuid; v_e uuid; v_f uuid;
begin
  v_mon := v_today + (8 - extract(isodow from v_today)::int);                 -- next Monday (a week ahead on a Monday)
  begin
    insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values (v_org, 'selftest', 'Africa/Luanda', 'XXX', 2, 'X');
    insert into public.people (id, organization_id, display_name) values (v_x, v_org, 'x');
    begin perform private.admin_shorten_future_periods_to_schedule(v_org, 'selftest'); raise exception 'selftest: no schedule accepted';
    exception when others then if sqlerrm <> 'WEEK_END_NOT_AVAILABLE' then raise; end if; end;
    update public.organizations set week_last_operating_day = 6, usual_closing_time = time '20:00' where id = v_org;
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'cur', v_mon - 7, v_mon - 1) returning id into v_f;
    insert into public.periods (organization_id, label, starts_on, ends_on)
      values (v_org, 'Semana ' || to_char(v_mon, 'DD/MM') || '–' || to_char(v_mon + 6, 'DD/MM'), v_mon, v_mon + 6) returning id into v_a;
    insert into public.periods (organization_id, label, starts_on, ends_on, review_revision) values (v_org, 'touched', v_mon + 7, v_mon + 13, 1) returning id into v_b;
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'declared', v_mon + 14, v_mon + 20) returning id into v_c;
    insert into public.period_week_end_events (organization_id, period_id, kind, at, person_id, early, usual_closing_at, command_id)
      values (v_org, v_c, 'declared', now(), v_x, false, now(), gen_random_uuid());
    insert into public.periods (organization_id, label, starts_on, ends_on, state) values (v_org, 'approved', v_mon + 21, v_mon + 27, 'pronto_para_pagamento') returning id into v_d;
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'aligned', v_mon + 28, v_mon + 33) returning id into v_e;

    r := private.admin_shorten_future_periods_to_schedule(v_org, 'selftest');
    if (r ->> 'applied')::boolean or jsonb_array_length(r -> 'eligible') <> 1 or r -> 'eligible' -> 0 ->> 'period_id' is distinct from v_a::text
       or (r -> 'eligible' -> 0 ->> 'new_ends_on')::date is distinct from v_mon + 5
       or r -> 'eligible' -> 0 ->> 'new_label' is distinct from 'Semana ' || to_char(v_mon, 'DD/MM') || '–' || to_char(v_mon + 5, 'DD/MM')
       or (select jsonb_object_agg(s ->> 'label', s ->> 'reason') from jsonb_array_elements(r -> 'skipped') s)
          is distinct from jsonb_build_object('cur', 'started', 'touched', 'has_history', 'declared', 'has_history', 'approved', 'not_open', 'aligned', 'already_ends_on_operating_day') then
      raise exception 'selftest: dry run %', r; end if;
    if (select ends_on from public.periods where id = v_a) <> v_mon + 6 then raise exception 'selftest: the dry run changed a period'; end if;

    r := private.admin_shorten_future_periods_to_schedule(v_org, 'selftest', true);
    if (select (starts_on, ends_on, label) from public.periods where id = v_a)
         is distinct from (v_mon, v_mon + 5, 'Semana ' || to_char(v_mon, 'DD/MM') || '–' || to_char(v_mon + 5, 'DD/MM'))
       or (select array_agg(ends_on order by starts_on) from public.periods where organization_id = v_org and id <> v_a)
         is distinct from array[v_mon - 1, v_mon + 13, v_mon + 20, v_mon + 27, v_mon + 33] then
      raise exception 'selftest: applied %', r; end if;
    if (select count(*) from private.security_audit where action = 'period_shortened' and organization_id = v_org and subject = v_a
          and (detail -> 'ends_on' ->> 'to')::date = v_mon + 5 and detail ->> 'reason' = 'selftest') <> 1
       or (select count(*) from private.security_audit where action = 'period_shortened' and organization_id = v_org) <> 1 then raise exception 'selftest: audit'; end if;
    if jsonb_array_length(private.admin_shorten_future_periods_to_schedule(v_org, 'selftest', true) -> 'changed') <> 0 then raise exception 'selftest: not idempotent'; end if;
    raise exception 'selftest_ok';
  exception when others then
    if sqlerrm <> 'selftest_ok' then raise; end if;
  end;
end $$;
