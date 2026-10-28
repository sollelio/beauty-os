-- Precision for 20261030000100 (Sollelio, 2026-10-28). Approval fixes the operational figures and what is owed to the
-- team: production, services, expenses (and by category), salon purchases — records are refused and cancellation is
-- closed once a period is approved — and team earnings (rules change after approval only through its annulment, 07 D7
-- I4), with operating costs, result and retention built from them. **Livre** is not: reserve allocations and uses stay
-- recordable until the period closes (07 D1), so it and the reserve figures are final only at close. Business Health
-- therefore compares them only against **closed** periods:
--   · previous period approved but not closed: its Livre and reserve figures are not given (no "antes", no change); the
--     owners' decision and the paid / unpaid amounts, never compared, are left out too;
--   · average of 3: Livre is averaged only when every period of the window is closed.
-- Everything else keeps comparing against approved periods. Patched in place (abort unless each anchor occurs once).
do $$
declare v_src text := pg_get_functiondef('public.business_health(uuid)'::regprocedure); v_pair text[]; v_a text; v_b text;
begin
  foreach v_pair slice 1 in array array[
    [$a$  if v_prev_p.id is not null and v_prev_p.state <> 'aberto' then
    select x into v_prev from jsonb_array_elements(v_refs) x where x -> 'period' ->> 'id' = v_prev_p.id::text;
  end if;$a$,
     $b$  if v_prev_p.id is not null and v_prev_p.state <> 'aberto' then
    select x into v_prev from jsonb_array_elements(v_refs) x where x -> 'period' ->> 'id' = v_prev_p.id::text;
  end if;
  -- Livre and the reserve can still change until a period closes (reserve records): from an approved period that is not
  -- closed they are no comparison (nor the owners' decision or the paid / unpaid amounts, which are never compared)
  if v_prev is not null and v_prev_p.state <> 'fechado' then
    v_prev := v_prev - array['free_minor', 'reserve_allocated_minor', 'reserve_used_minor', 'undistributed_minor', 'owners_decision',
                             'unpaid_team_minor', 'paid_team_minor'];
  end if;$b$],
    [$a$    v_avg := v_avg || jsonb_build_object('periods', (select jsonb_agg(x -> 'period') from jsonb_array_elements(v_refs) with ordinality t(x, n) where n <= v_win));
  end if;$a$,
     $b$    v_avg := v_avg || jsonb_build_object('periods', (select jsonb_agg(x -> 'period') from jsonb_array_elements(v_refs) with ordinality t(x, n) where n <= v_win));
    -- Livre is averaged only over closed periods (it can still change until close)
    if exists (select 1 from jsonb_array_elements(v_refs) with ordinality t(x, n) where n <= v_win and x -> 'period' ->> 'state' <> 'fechado') then
      v_avg := v_avg - 'free_minor';
    end if;
  end if;$b$]] loop
    v_a := v_pair[1]; v_b := v_pair[2];
    if (length(v_src) - length(replace(v_src, v_a, ''))) / length(v_a) <> 1 then raise exception 'livre patch: business_health anchor not found once: %', left(v_a, 60); end if;
    v_src := replace(v_src, v_a, v_b);
  end loop;
  execute v_src;
  if position($x$v_avg := v_avg - 'free_minor'$x$ in pg_get_functiondef('public.business_health(uuid)'::regprocedure)) = 0 then raise exception 'livre patch failed'; end if;
end $$;
