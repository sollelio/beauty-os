-- Weekly accrual + flexible later payment (Sollelio, 2026-10-28): a week's approval fixes its figures; paying the team
-- later (often around month-end) does not make them more accurate. Business Health therefore compares against
-- **approved** periods — Pronto para pagamento, Em pagamento or Fechado — not only closed ones. An Aberto period is never
-- a reference. Closing still means the period's approved obligations were paid (unchanged); payments, approval and close
-- are untouched. Figures of a closed period still come from its close statement (ADR-0007); of an approved one, from the
-- live calculation over inputs frozen by the approval.
--   · private.business_previous_reason (shared by every Negócio page): the previous period must be approved, else
--     'previous_not_approved' (was: closed, 'previous_not_closed').
--   · public.business_health: the reference set for the average (and the expense-category history) is the approved
--     periods of comparable length before the selected one (was: closed), and the previous period's figures are taken
--     from that set when it is approved.

create or replace function private.business_previous_reason(p_period public.periods, p_prev public.periods)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when p_period.ends_on >= (now() at time zone (select o.timezone from public.organizations o where o.id = p_period.organization_id))::date then 'current_incomplete'
    when p_prev.id is null then 'no_previous_period'
    when p_prev.state = 'aberto' then 'previous_not_approved'
    when abs((p_prev.ends_on - p_prev.starts_on + 1) - (p_period.ends_on - p_period.starts_on + 1))
         > (private.business_health_config() ->> 'comparable_length_tolerance')::numeric * (p_period.ends_on - p_period.starts_on + 1) then 'previous_not_comparable'
  end
$$;
revoke all on function private.business_previous_reason(public.periods, public.periods) from public, anon, authenticated;

-- business_health: patched in place (abort unless each anchor occurs once)
do $$
declare v_src text := pg_get_functiondef('public.business_health(uuid)'::regprocedure); v_pair text[]; v_a text; v_b text;
begin
  foreach v_pair slice 1 in array array[
    [$a$  -- reference set: closed, comparable length, before the selected period, most recent first$a$,
     $b$  -- reference set: approved (Pronto para pagamento, Em pagamento, Fechado), comparable length, before the selected period, most recent first$b$],
    [$a$where pe.organization_id = v_org and pe.starts_on < v_period.starts_on and pe.state = 'fechado'$a$,
     $b$where pe.organization_id = v_org and pe.starts_on < v_period.starts_on and pe.state <> 'aberto'$b$],
    [$a$if v_prev_p.id is not null and v_prev_p.state = 'fechado' then$a$,
     $b$if v_prev_p.id is not null and v_prev_p.state <> 'aberto' then$b$]] loop
    v_a := v_pair[1]; v_b := v_pair[2];
    if (length(v_src) - length(replace(v_src, v_a, ''))) / length(v_a) <> 1 then raise exception 'approved periods patch: business_health anchor not found once: %', v_a; end if;
    v_src := replace(v_src, v_a, v_b);
  end loop;
  execute v_src;
end $$;

-- Self-test, rolled back: the reason accepts every approved state, refuses an Aberto previous period, keeps the others.
do $$
declare v_org uuid := gen_random_uuid(); v_p public.periods; v_q public.periods; s text;
begin
  begin
    insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values (v_org, 'selftest', 'Africa/Luanda', 'XXX', 2, 'X');
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'q', date '2020-01-06', date '2020-01-12') returning * into v_q;
    insert into public.periods (organization_id, label, starts_on, ends_on) values (v_org, 'p', date '2020-01-13', date '2020-01-19') returning * into v_p;
    if private.business_previous_reason(v_p, v_q) is distinct from 'previous_not_approved' then raise exception 'selftest: aberto previous'; end if;
    foreach s in array array['pronto_para_pagamento', 'em_pagamento', 'fechado'] loop
      v_q.state := s;
      if private.business_previous_reason(v_p, v_q) is not null then raise exception 'selftest: % previous', s; end if;
    end loop;
    v_q.ends_on := date '2020-01-08';                                              -- 3 days against 7: not comparable
    if private.business_previous_reason(v_p, v_q) is distinct from 'previous_not_comparable' then raise exception 'selftest: comparable length'; end if;
    if position($x$pe.state <> 'aberto'$x$ in pg_get_functiondef('public.business_health(uuid)'::regprocedure)) = 0 then raise exception 'selftest: business_health patch'; end if;
    raise exception 'selftest_ok';
  exception when others then
    if sqlerrm <> 'selftest_ok' then raise; end if;
  end;
end $$;
