-- Business Health on the period lifecycle (Sollelio, 2026-11-03). With periods generated on demand, a week without any
-- activity may never exist; comparisons stay calendar-correct instead of reaching past it:
--   · private.periods_adjacent(earlier, later): nothing operational lies between them — every day in between is a
--     non-operating day of the organization's schedule (a day is operating when its ISO weekday is within the first and
--     last operating day; a missing bound is the week's edge, so with no schedule there may be no day in between).
--   · private.business_previous_period (Visão geral, Equipa, Serviços — and the two-step growth/decline of Serviços):
--     the immediately preceding period only; when the latest earlier period is not adjacent, there is none, and
--     private.business_previous_reason says 'previous_missing' (an earlier period exists, the one right before does not).
--   · the reference set of public.business_health (3-period average, expense-category history): walked back through the
--     contiguous calendar periods and stopped at the first missing one, so an older period never stands in for a missing
--     week. Within the contiguous run the existing rule is unchanged (approved, comparable length).
--   · a period that has not started (private.period_started) is not given by any Business Health read, even by id:
--     PERIOD_NOT_STARTED (lists and defaults already leave it out). private.business_period resolves the period for
--     business_health, business_team, business_services, business_costs and business_finance.
-- Nothing else changes; no period is created to make a comparison work.

create or replace function private.periods_adjacent(p_earlier public.periods, p_later public.periods)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_earlier.ends_on < p_later.starts_on
     and not exists (select 1 from generate_series(p_earlier.ends_on + 1, p_later.starts_on - 1, interval '1 day') d
                      where extract(isodow from d)::int between coalesce(o.week_first_operating_day, 1) and coalesce(o.week_last_operating_day, 7))
    from public.organizations o where o.id = p_later.organization_id
$$;
revoke all on function private.periods_adjacent(public.periods, public.periods) from public, anon, authenticated;

create or replace function private.business_previous_period(p_org uuid, p_period public.periods)
returns setof public.periods language sql stable security definer set search_path = '' as $$
  select pe.* from (select * from public.periods x where x.organization_id = p_org and x.starts_on < p_period.starts_on
                     order by x.starts_on desc limit 1) pe
   where private.periods_adjacent(pe, p_period)
$$;
revoke all on function private.business_previous_period(uuid, public.periods) from public, anon, authenticated;

create or replace function private.business_previous_reason(p_period public.periods, p_prev public.periods)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when p_period.ends_on >= (now() at time zone (select o.timezone from public.organizations o where o.id = p_period.organization_id))::date then 'current_incomplete'
    when p_prev.id is null and exists (select 1 from public.periods pe where pe.organization_id = p_period.organization_id
                                        and pe.starts_on < p_period.starts_on) then 'previous_missing'
    when p_prev.id is null then 'no_previous_period'
    when p_prev.state = 'aberto' then 'previous_not_approved'
    when abs((p_prev.ends_on - p_prev.starts_on + 1) - (p_period.ends_on - p_period.starts_on + 1))
         > (private.business_health_config() ->> 'comparable_length_tolerance')::numeric * (p_period.ends_on - p_period.starts_on + 1) then 'previous_not_comparable'
  end
$$;
revoke all on function private.business_previous_reason(public.periods, public.periods) from public, anon, authenticated;

create or replace function private.business_period(p_period_id uuid)
returns public.periods language plpgsql stable security definer set search_path = '' as $$
declare v_p public.periods := private.resolve_period(p_period_id);
begin
  if not private.period_started(v_p) then raise exception 'PERIOD_NOT_STARTED'; end if;
  return v_p;
end $$;
revoke all on function private.business_period(uuid) from public, anon, authenticated;

-- patches in place (abort unless each anchor occurs once)
do $$
declare
  v_fn text; v_src text; v_pair text[]; v_a text; v_b text;
  c_res_a text := $a$v_period public.periods := private.resolve_period(p_period_id);$a$;
  c_res_b text := $b$v_period public.periods := private.business_period(p_period_id);$b$;
begin
  foreach v_pair slice 1 in array array[
    ['public.business_health(uuid)', c_res_a, c_res_b],
    ['public.business_team(uuid)', c_res_a, c_res_b],
    ['public.business_services(uuid)', c_res_a, c_res_b],
    ['public.business_costs(uuid)', c_res_a, c_res_b],
    ['public.business_finance(uuid)', c_res_a, c_res_b],
    ['public.business_health(uuid)', $a$v_cats jsonb; r public.periods;$a$, $b$v_cats jsonb; r public.periods; v_chain public.periods;$b$],
    ['public.business_health(uuid)',
     $a$  for r in select * from public.periods pe
            where pe.organization_id = v_org and pe.starts_on < v_period.starts_on and pe.state <> 'aberto'
              and abs((pe.ends_on - pe.starts_on + 1) - v_days) <= v_tol * v_days
            order by pe.starts_on desc loop
    v_refs := v_refs || jsonb_build_array(private.business_redact(private.business_period_metrics(v_org, r), v_fin, v_viewer));
  end loop;$a$,
     $b$  -- walked back through the contiguous calendar periods: a missing period ends the run (no older one stands in for it)
  v_chain := v_period;
  for r in select * from public.periods pe
            where pe.organization_id = v_org and pe.starts_on < v_period.starts_on
            order by pe.starts_on desc loop
    exit when not private.periods_adjacent(r, v_chain);
    v_chain := r;
    continue when r.state = 'aberto' or abs((r.ends_on - r.starts_on + 1) - v_days) > v_tol * v_days;
    v_refs := v_refs || jsonb_build_array(private.business_redact(private.business_period_metrics(v_org, r), v_fin, v_viewer));
  end loop;$b$]] loop
    v_fn := v_pair[1]; v_a := v_pair[2]; v_b := v_pair[3];
    v_src := pg_get_functiondef(v_fn::regprocedure);
    if (length(v_src) - length(replace(v_src, v_a, ''))) / length(v_a) <> 1 then raise exception 'calendar periods patch: % anchor not found once: %', v_fn, left(v_a, 50); end if;
    execute replace(v_src, v_a, v_b);
  end loop;
end $$;

-- Self-test, rolled back: Monday–Saturday weeks — a Sunday between them keeps them adjacent, a missing week does not;
-- no schedule — any day between breaks adjacency; the previous period is the adjacent one or none ('previous_missing').
do $$
declare v_org uuid := gen_random_uuid(); v_bare uuid := gen_random_uuid(); a public.periods; b public.periods; c public.periods; x public.periods;
begin
  begin
    insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol, week_first_operating_day, week_last_operating_day, usual_closing_time)
      values (v_org, 'selftest', 'Africa/Luanda', 'XXX', 2, 'X', 1, 6, time '20:00');
    insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values (v_bare, 'selftest bare', 'Africa/Luanda', 'XXX', 2, 'X');
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'a', date '2020-01-06', date '2020-01-11') returning * into a;
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'b', date '2020-01-13', date '2020-01-18') returning * into b;
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'c', date '2020-01-27', date '2020-02-01') returning * into c;   -- 20–25/01 missing
    if not private.periods_adjacent(a, b) or private.periods_adjacent(b, c) or private.periods_adjacent(b, a) then raise exception 'selftest: adjacency'; end if;
    select * into x from private.business_previous_period(v_org, b);
    if x.id is distinct from a.id then raise exception 'selftest: previous of b'; end if;
    x := null;
    select * into x from private.business_previous_period(v_org, c);
    if x.id is not null or private.business_previous_reason(c, x) is distinct from 'previous_missing' then raise exception 'selftest: previous of c'; end if;
    if private.business_previous_reason(a, x) is distinct from 'no_previous_period' then raise exception 'selftest: first period'; end if;
    a.organization_id := v_bare; b.organization_id := v_bare;
    if private.periods_adjacent(a, b) then raise exception 'selftest: no schedule, a Sunday between'; end if;
    a.ends_on := date '2020-01-12';
    if not private.periods_adjacent(a, b) then raise exception 'selftest: no schedule, contiguous'; end if;
    if position('private.business_period(p_period_id)' in pg_get_functiondef('public.business_finance(uuid)'::regprocedure)) = 0
       or position('exit when not private.periods_adjacent' in pg_get_functiondef('public.business_health(uuid)'::regprocedure)) = 0 then raise exception 'selftest: patches'; end if;
    raise exception 'selftest_ok';
  exception when others then
    if sqlerrm <> 'selftest_ok' then raise; end if;
  end;
end $$;
