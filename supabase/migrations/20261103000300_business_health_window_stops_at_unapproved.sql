-- Business Health rolling window, calendar-correct (Sollelio, 2026-11-03; follows 20261103000200). Walking back from the
-- selected period through adjacent periods, the reference set (3-period average, expense-category history) now stops at
-- the first adjacent period that is missing OR not yet approved ('aberto'); an approved one is included and the walk
-- continues. An Aberto week is never skipped to reach an older approved one, so three references are always the three
-- periods right before. The previous-period comparison is unchanged (an Aberto previous period is 'previous_not_approved').
-- Patched in place (abort unless the anchor occurs once).
do $$
declare
  v_src text := pg_get_functiondef('public.business_health(uuid)'::regprocedure);
  v_a text := $a$    continue when r.state = 'aberto' or abs((r.ends_on - r.starts_on + 1) - v_days) > v_tol * v_days;$a$;
  v_b text := $b$    exit when r.state = 'aberto';                    -- not yet approved: the run ends here too (never skipped)
    continue when abs((r.ends_on - r.starts_on + 1) - v_days) > v_tol * v_days;$b$;
begin
  if (length(v_src) - length(replace(v_src, v_a, ''))) / length(v_a) <> 1 then raise exception 'window patch: business_health anchor not found once'; end if;
  execute replace(v_src, v_a, v_b);
  if position($x$exit when r.state = 'aberto';$x$ in pg_get_functiondef('public.business_health(uuid)'::regprocedure)) = 0 then raise exception 'window patch failed'; end if;
end $$;
