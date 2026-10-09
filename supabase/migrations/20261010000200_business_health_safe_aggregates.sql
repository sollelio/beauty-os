-- Business Health · safe aggregate finance stays visible (07 D9, B11). Reverses the blanket rule of 20261010000100.
-- For a viewer without team.finance.read, a team-derived figure is hidden only in a period where it resolves to one
-- other person: exactly one person other than the viewer earned (team earnings, costs, result, retention, Livre), or
-- exactly one person other than the viewer is still owed (A pagar à equipa). Otherwise the aggregate stays visible.
-- business_team (Equipa) is unchanged.

create or replace function private.business_period_metrics(p_org uuid, p_period public.periods)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text; v_today date; v_stmt public.period_close_statements; v_pos jsonb; v_closed boolean; v_appr public.period_approvals;
  v_lines jsonb; v_unpaid bigint; v_prod bigint; v_pending int; v_team bigint; v_exp bigint; v_pur bigint; v_costs bigint; v_result bigint;
  v_earners jsonb; v_owed jsonb;
begin
  select o.timezone into v_tz from public.organizations o where o.id = p_org;
  v_today := (now() at time zone v_tz)::date;
  select * into v_stmt from public.period_close_statements s where s.period_id = p_period.id order by s.seq desc limit 1;
  v_closed := p_period.state = 'fechado' and v_stmt.id is not null;
  if v_closed then
    v_pos := v_stmt.statement -> 'position';
    v_lines := v_stmt.statement -> 'approval' -> 'lines';
  else
    v_pos := private.period_position(p_org, p_period);
    v_appr := private.current_approval(p_period.id);
    if v_appr.id is not null then v_lines := private.approval_payments(v_appr); end if;
  end if;
  if v_lines is not null then
    select coalesce(sum((l ->> 'outstanding_minor')::bigint), 0),
           coalesce(jsonb_agg(l -> 'person_id') filter (where (l ->> 'outstanding_minor')::bigint > 0), '[]'::jsonb)
      into v_unpaid, v_owed from jsonb_array_elements(v_lines) l;
  end if;
  select coalesce(jsonb_agg(x -> 'person_id'), '[]'::jsonb) into v_earners
    from jsonb_array_elements(coalesce(v_pos -> 'people', '[]'::jsonb)) x where (x ->> 'earned_minor')::bigint > 0;

  v_prod := (v_pos -> 'production' ->> 'total_minor')::bigint;
  v_pending := jsonb_array_length(v_pos -> 'pending');
  v_exp := (v_pos -> 'expenses' ->> 'total_minor')::bigint;
  v_pur := (v_pos -> 'purchases' ->> 'salon_minor')::bigint;
  if v_pending = 0 then
    v_team := (v_pos ->> 'team_earned_minor')::bigint;
    v_costs := v_team + v_exp + v_pur;
    v_result := v_prod - v_costs;
  end if;

  return jsonb_build_object(
    'period', jsonb_build_object('id', p_period.id, 'label', p_period.label, 'state', p_period.state,
                                 'starts_on', p_period.starts_on, 'ends_on', p_period.ends_on,
                                 'days', p_period.ends_on - p_period.starts_on + 1, 'is_complete', p_period.ends_on < v_today),
    'source', case when v_closed then 'close_statement' else 'live' end,
    'production_minor', v_prod,
    'services_count', (v_pos -> 'production' ->> 'count')::int,
    'team_earnings_minor', v_team,
    'expenses_minor', v_exp,
    'purchases_salon_minor', v_pur,
    'operating_costs_minor', v_costs,
    'operating_result_minor', v_result,
    'retention_pct', case when v_result is not null and v_prod > 0 then round(v_result * 100.0 / v_prod, 1) end,
    'free_minor', (v_pos ->> 'livre_minor')::bigint,
    'unpaid_team_minor', v_unpaid,
    'approved', v_lines is not null,
    'pending_rules_count', v_pending,
    -- internal, removed by business_redact: who the team figures are made of
    '_earners', v_earners, '_owed', coalesce(v_owed, '[]'::jsonb),
    'expenses_by_category', coalesce((
      select jsonb_agg(jsonb_build_object('category_id', c.id, 'label', c.label, 'amount_minor', x.total) order by x.total desc, c.label)
        from (select e.category_id, sum(e.amount_minor) as total from private.active_expenses e
               where e.organization_id = p_org and (e.occurred_at at time zone v_tz)::date between p_period.starts_on and p_period.ends_on
               group by e.category_id) x
        join public.expense_categories c on c.id = x.category_id), '[]'::jsonb));
end $$;

-- Who a team figure belongs to (B11, 07 D9). For a viewer without team.finance.read, a figure is hidden when exactly
-- one person other than the viewer is inside it (the viewer's own figures are theirs to know, so with them removed
-- the rest would be that one person's). Hidden with the team's earnings is everything that gives them back exactly
-- from the figures still shown (production, expenses, salon purchases):
--   custos = ganhos + despesas + compras · resultado = produção − custos · retenção = resultado / produção
--   Livre  = resultado − reserva alocada + pago pela reserva − acima do ganho   (equal to the result when the reserve
--            did not move, so it is hidden too)
-- The approved-and-unpaid amount is hidden on the same test over the people still owed. A hidden figure is null and
-- named in private_fields; comparisons and averages treat it as missing, so nothing is computed from it.
create or replace function private.business_redact(p_m jsonb, p_finance boolean, p_viewer uuid)
returns jsonb language plpgsql immutable as $$
declare v_hide text[] := '{}'; v_k text; v_out jsonb;
begin
  if p_m is null then return null; end if;
  if not p_finance then
    if (select count(*) from jsonb_array_elements_text(p_m -> '_earners') x where x::uuid is distinct from p_viewer) = 1 then
      v_hide := v_hide || array['team_earnings_minor', 'operating_costs_minor', 'operating_result_minor', 'retention_pct', 'free_minor'];
    end if;
    if (select count(*) from jsonb_array_elements_text(p_m -> '_owed') x where x::uuid is distinct from p_viewer) = 1 then
      v_hide := v_hide || array['unpaid_team_minor'];
    end if;
  end if;
  v_out := p_m - '_earners' - '_owed';
  -- only a figure that exists is hidden; one that is undefined (a rule pending) stays undefined
  v_hide := array(select k from unnest(v_hide) k where v_out ->> k is not null);
  foreach v_k in array v_hide loop v_out := v_out || jsonb_build_object(v_k, null); end loop;
  return v_out || jsonb_build_object('private_fields', to_jsonb(v_hide));
end $$;

drop function private.business_redact(jsonb, boolean);

create or replace function public.business_health(p_period_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := private.require_business_viewer();
  v_org uuid := private.current_org_id();
  v_period public.periods := private.resolve_period(p_period_id);
  v_cfg jsonb := private.business_health_config();
  v_tol numeric := (v_cfg ->> 'comparable_length_tolerance')::numeric; v_win int := (v_cfg ->> 'average_window')::int;
  v_days int := v_period.ends_on - v_period.starts_on + 1;
  v_cur jsonb; v_prev_p public.periods; v_prev jsonb; v_prev_reason text; v_refs jsonb := '[]'::jsonb; v_avg jsonb; v_avg_reason text;
  v_history int; v_keys text[] := array['production_minor', 'operating_costs_minor', 'operating_result_minor', 'free_minor',
                                        'team_earnings_minor', 'expenses_minor', 'purchases_salon_minor', 'services_count'];
  v_fin boolean := private.has_permission(v_viewer, 'team.finance.read');
  v_k text; v_changes_prev jsonb := '{}'::jsonb; v_changes_avg jsonb := '{}'::jsonb; v_cats jsonb; r public.periods;
begin
  -- every period's figures pass business_redact before anything is compared, averaged or returned (B11)
  v_cur := private.business_redact(private.business_period_metrics(v_org, v_period), v_fin, v_viewer);

  -- reference set: closed, comparable length, before the selected period, most recent first
  for r in select * from public.periods pe
            where pe.organization_id = v_org and pe.starts_on < v_period.starts_on and pe.state = 'fechado'
              and abs((pe.ends_on - pe.starts_on + 1) - v_days) <= v_tol * v_days
            order by pe.starts_on desc loop
    v_refs := v_refs || jsonb_build_array(private.business_redact(private.business_period_metrics(v_org, r), v_fin, v_viewer));
  end loop;
  v_history := jsonb_array_length(v_refs);

  select * into v_prev_p from private.business_previous_period(v_org, v_period);
  v_prev_reason := private.business_previous_reason(v_period, v_prev_p);
  if v_prev_p.id is not null and v_prev_p.state = 'fechado' then
    select x into v_prev from jsonb_array_elements(v_refs) x where x -> 'period' ->> 'id' = v_prev_p.id::text;
  end if;

  v_avg_reason := case when not (v_cur -> 'period' ->> 'is_complete')::boolean then 'current_incomplete'
                       when v_history < v_win then 'insufficient_history' end;
  if v_history >= v_win then
    -- a figure hidden in any period of the window is not averaged (the other periods' figures would give it back)
    select jsonb_object_agg(k, (select case when count(x ->> k) = v_win then round(avg((x ->> k)::numeric)) end
                                  from (select x from jsonb_array_elements(v_refs) with ordinality t(x, n) where n <= v_win) w))
      into v_avg from unnest(v_keys) k;
    v_avg := v_avg || jsonb_build_object('private_fields', coalesce((select jsonb_agg(distinct f) from jsonb_array_elements(v_refs) with ordinality t(x, n),
                                           jsonb_array_elements_text(x -> 'private_fields') f where n <= v_win and f = any (v_keys)), '[]'::jsonb));
    v_avg := v_avg || jsonb_build_object('periods', (select jsonb_agg(x -> 'period') from jsonb_array_elements(v_refs) with ordinality t(x, n) where n <= v_win));
  end if;

  if v_prev_reason is null then
    foreach v_k in array v_keys loop v_changes_prev := v_changes_prev || jsonb_build_object(v_k, private.business_change(v_cur, v_prev, v_k)); end loop;
  end if;
  if v_avg_reason is null then
    foreach v_k in array v_keys loop v_changes_avg := v_changes_avg || jsonb_build_object(v_k, private.business_change(v_cur, v_avg, v_k)); end loop;
  end if;

  -- expense categories: current, previous and the average over the window (absence counts as 0), and in how many
  -- reference periods the category appeared
  select coalesce(jsonb_agg(jsonb_build_object('category_id', c.category_id, 'label', c.label, 'current_minor', c.cur,
           'previous_minor', c.prev, 'average_3_minor', c.avg3, 'reference_presence', c.presence) order by c.cur desc nulls last, c.label), '[]'::jsonb)
    into v_cats
    from (
      select ids.category_id, (select label from public.expense_categories where id = ids.category_id) as label,
             coalesce((select (e ->> 'amount_minor')::bigint from jsonb_array_elements(v_cur -> 'expenses_by_category') e where e ->> 'category_id' = ids.category_id::text), 0) as cur,
             case when v_prev is not null then coalesce((select (e ->> 'amount_minor')::bigint from jsonb_array_elements(v_prev -> 'expenses_by_category') e where e ->> 'category_id' = ids.category_id::text), 0) end as prev,
             case when v_history >= v_win then (select round(sum(coalesce((select (e ->> 'amount_minor')::numeric from jsonb_array_elements(x -> 'expenses_by_category') e where e ->> 'category_id' = ids.category_id::text), 0)) / v_win)
                                                  from jsonb_array_elements(v_refs) with ordinality t(x, n) where n <= v_win) end as avg3,
             case when v_history >= v_win then (select count(*) from jsonb_array_elements(v_refs) with ordinality t(x, n)
                                                 where n <= v_win and exists (select 1 from jsonb_array_elements(x -> 'expenses_by_category') e where e ->> 'category_id' = ids.category_id::text)) end as presence
        from (select distinct (e ->> 'category_id')::uuid as category_id
                from (select v_cur as m union all select x from jsonb_array_elements(v_refs) with ordinality t(x, n) where n <= greatest(v_win, 1)) s,
                     jsonb_array_elements(s.m -> 'expenses_by_category') e) ids) c;

  return jsonb_build_object(
    'current', v_cur - 'expenses_by_category',
    'previous', case when v_prev is null then null else v_prev - 'expenses_by_category' end,
    'average_3', v_avg,
    'changes', jsonb_build_object('previous', case when v_prev_reason is null then v_changes_prev end,
                                  'average_3', case when v_avg_reason is null then v_changes_avg end),
    'expense_categories', v_cats,
    'meta', jsonb_build_object(
      'period_state', v_period.state, 'is_complete', (v_cur -> 'period' ->> 'is_complete')::boolean, 'history_count', v_history,
      'comparison', jsonb_build_object(
        'previous', jsonb_build_object('available', v_prev_reason is null, 'reason', v_prev_reason,
                                       'period', case when v_prev_p.id is null then null else jsonb_build_object('id', v_prev_p.id, 'label', v_prev_p.label, 'state', v_prev_p.state) end),
        'average_3', jsonb_build_object('available', v_avg_reason is null, 'reason', v_avg_reason, 'window', v_win)),
      'baseline', case when v_prev_reason is null and v_avg_reason is null then 'previous_and_average_3'
                       when v_prev_reason is null then 'previous' when v_avg_reason is null then 'average_3' else 'none' end,
      'config', v_cfg, 'calculation_version', private.calculation_version()),
    -- open action state of this and earlier periods (approved-but-unpaid amounts, rules blocking approval)
    'open_periods', coalesce((select jsonb_agg(jsonb_build_object('id', m -> 'period' -> 'id', 'label', m -> 'period' -> 'label', 'state', m -> 'period' -> 'state',
                         'is_complete', m -> 'period' -> 'is_complete', 'unpaid_team_minor', m -> 'unpaid_team_minor', 'unpaid_private', m -> 'private_fields' ? 'unpaid_team_minor',
                         'pending_rules_count', m -> 'pending_rules_count')
                         order by m -> 'period' ->> 'starts_on' desc)
                       from (select private.business_redact(private.business_period_metrics(v_org, pe), v_fin, v_viewer) as m from public.periods pe
                              where pe.organization_id = v_org and pe.state <> 'fechado' and pe.starts_on <= v_period.starts_on) o), '[]'::jsonb),
    'trend', coalesce((select jsonb_agg(jsonb_build_object('id', m -> 'period' -> 'id', 'label', m -> 'period' -> 'label', 'is_complete', m -> 'period' -> 'is_complete',
                         'production_minor', m -> 'production_minor', 'operating_result_minor', m -> 'operating_result_minor',
                         'result_private', m -> 'private_fields' ? 'operating_result_minor') order by m -> 'period' ->> 'starts_on')
                       from (select private.business_redact(private.business_period_metrics(v_org, pe), v_fin, v_viewer) as m from (
                               select * from public.periods pe where pe.organization_id = v_org and pe.starts_on <= v_period.starts_on
                                order by pe.starts_on desc limit (v_cfg ->> 'trend_periods')::int) pe) t), '[]'::jsonb));
end $$;

revoke all on function private.business_redact(jsonb, boolean, uuid) from public, anon, authenticated;
