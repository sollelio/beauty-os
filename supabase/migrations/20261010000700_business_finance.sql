-- Business Health · Slice 05 (Negócio → Finanças): how healthy the business is financially, what changed, what puts
-- pressure on the result. public.business_finance(period) for a business.health.read holder; no team.finance.read
-- needed for the safe aggregates. Not an accounting statement: the product's own terms (Produção, Custos operacionais,
-- Resultado operacional, Livre, Não distribuído, Reserva, A pagar à equipa); no "lucro".
--
-- Reuse, not a second model: every figure is business_period_metrics (the Fecho position: live, or the latest close
-- statement for a closed period, ADR-0004/0007) passed through business_redact, and the comparison is business_health's
-- (Slice 01 rule). This read only arranges them, adds the indicators (ratios of figures already returned), the
-- deterministic drivers and the reserve / decision context.
--
-- New period figures (business-level): reserve allocated / used in the period (the position's), Não distribuído
-- (Livre − the owners' decision), whether an owners' decision is recorded (its kind, never an amount or an owner),
-- paid to the team against the approval (Σ paid of the approval lines).
--
-- Privacy (07 D9, B11) for a viewer without team.finance.read, counting people other than the viewer:
--   · with the reserve figures, Resultado − Livre − alocado + usado is the team's "acima do ganho" (advances above
--     earnings): where exactly one other person is above their earnings, Livre (and Não distribuído) are hidden;
--   · Não distribuído is hidden wherever Livre is;
--   · paid + unpaid = team earnings − advances: paid is hidden where exactly one other person was paid, or had an
--     advance in the approval, or wherever the unpaid amount or the team earnings are hidden.
-- These hold everywhere business_redact runs (overview, trend, averages), so a combination of screens gives nothing more.

create or replace function private.business_period_metrics(p_org uuid, p_period public.periods)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text; v_today date; v_stmt public.period_close_statements; v_pos jsonb; v_closed boolean; v_appr public.period_approvals;
  v_lines jsonb; v_unpaid bigint; v_paid bigint; v_prod bigint; v_pending int; v_team bigint; v_exp bigint; v_pur bigint; v_costs bigint; v_result bigint;
  v_earners jsonb; v_owed jsonb; v_contributors jsonb; v_paid_to jsonb; v_advanced jsonb; v_excess jsonb;
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
    select coalesce(sum((l ->> 'outstanding_minor')::bigint), 0), coalesce(sum((l ->> 'paid_minor')::bigint), 0),
           coalesce(jsonb_agg(l -> 'person_id') filter (where (l ->> 'outstanding_minor')::bigint > 0), '[]'::jsonb),
           coalesce(jsonb_agg(l -> 'person_id') filter (where (l ->> 'paid_minor')::bigint > 0), '[]'::jsonb),
           coalesce(jsonb_agg(l -> 'person_id') filter (where (l ->> 'advances_minor')::bigint > 0), '[]'::jsonb)
      into v_unpaid, v_paid, v_owed, v_paid_to, v_advanced from jsonb_array_elements(v_lines) l;
  end if;
  select coalesce(jsonb_agg(distinct c.person_id), '[]'::jsonb) into v_contributors
    from private.active_purchases pu join public.purchase_contributions c on c.purchase_id = pu.id
   where pu.organization_id = p_org and c.contributor_kind = 'person'
     and (pu.occurred_at at time zone v_tz)::date between p_period.starts_on and p_period.ends_on;
  select coalesce(jsonb_agg(x -> 'person_id') filter (where (x ->> 'earned_minor')::bigint > 0), '[]'::jsonb),
         coalesce(jsonb_agg(x -> 'person_id') filter (where (x ->> 'excess_minor')::bigint > 0), '[]'::jsonb)
    into v_earners, v_excess
    from jsonb_array_elements(coalesce(v_pos -> 'people', '[]'::jsonb)) x;

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
    'paid_team_minor', v_paid,
    'approved', v_lines is not null,
    'pending_rules_count', v_pending,
    'reserve_allocated_minor', coalesce((v_pos ->> 'reserve_allocated_minor')::bigint, 0),
    'reserve_used_minor', coalesce((v_pos ->> 'reserve_used_minor')::bigint, 0),
    'undistributed_minor', (v_pos ->> 'undistributed_minor')::bigint,
    'owners_decision', case when coalesce(v_pos -> 'owners_decision', 'null'::jsonb) = 'null'::jsonb then null else v_pos -> 'owners_decision' ->> 'kind' end,
    -- internal, removed by business_redact: who the team figures are made of
    '_earners', v_earners, '_owed', coalesce(v_owed, '[]'::jsonb), '_contributors', v_contributors,
    '_paid', coalesce(v_paid_to, '[]'::jsonb), '_advanced', coalesce(v_advanced, '[]'::jsonb), '_excess', v_excess,
    'expenses_by_category', coalesce((
      select jsonb_agg(jsonb_build_object('category_id', c.id, 'label', c.label, 'amount_minor', x.total) order by x.total desc, c.label)
        from (select e.category_id, sum(e.amount_minor) as total from private.active_expenses e
               where e.organization_id = p_org and (e.occurred_at at time zone v_tz)::date between p_period.starts_on and p_period.ends_on
               group by e.category_id) x
        join public.expense_categories c on c.id = x.category_id), '[]'::jsonb));
end $$;

create or replace function private.business_redact(p_m jsonb, p_finance boolean, p_viewer uuid)
returns jsonb language plpgsql immutable as $$
declare v_hide text[] := '{}'; v_k text; v_out jsonb;
begin
  if p_m is null then return null; end if;
  if not p_finance then
    if private.business_one_other(p_m -> '_earners', p_viewer) then
      v_hide := v_hide || array['team_earnings_minor', 'operating_costs_minor', 'operating_result_minor', 'retention_pct', 'free_minor'];
    end if;
    if private.business_one_other(p_m -> '_owed', p_viewer) then
      v_hide := v_hide || array['unpaid_team_minor'];
    end if;
    -- salon-funded purchases = purchase total − personal contributions; with line costs on the shared Stock screen,
    -- they give the contributions, so they (and every figure that contains them) are hidden where those resolve to
    -- one person other than the viewer
    if private.business_one_other(p_m -> '_contributors', p_viewer) then
      v_hide := v_hide || array['purchases_salon_minor', 'operating_costs_minor', 'operating_result_minor', 'retention_pct', 'free_minor'];
    end if;
    -- Resultado − Livre − alocado + usado = the team's amount above earnings (Slice 05)
    if private.business_one_other(p_m -> '_excess', p_viewer) then
      v_hide := v_hide || array['free_minor'];
    end if;
    -- paid + unpaid = team earnings − advances (Slice 05)
    if private.business_one_other(p_m -> '_paid', p_viewer) or private.business_one_other(p_m -> '_advanced', p_viewer) then
      v_hide := v_hide || array['paid_team_minor'];
    end if;
    if 'unpaid_team_minor' = any (v_hide) or 'team_earnings_minor' = any (v_hide) then v_hide := v_hide || array['paid_team_minor']; end if;
    if 'free_minor' = any (v_hide) then v_hide := v_hide || array['undistributed_minor']; end if;   -- Livre − the owners' decision
  end if;
  v_out := p_m - '_earners' - '_owed' - '_contributors' - '_paid' - '_advanced' - '_excess';
  -- only a figure that exists is hidden; one that is undefined (a rule pending) stays undefined
  v_hide := array(select k from unnest(v_hide) with ordinality t(k, n) where v_out ->> k is not null group by k order by min(n));
  foreach v_k in array v_hide loop v_out := v_out || jsonb_build_object(v_k, null); end loop;
  return v_out || jsonb_build_object('private_fields', to_jsonb(v_hide));
end $$;

-- exactly one person other than the viewer in a list of person ids
create or replace function private.business_one_other(p_ids jsonb, p_viewer uuid)
returns boolean language sql immutable as $$
  select (select count(distinct x) from jsonb_array_elements_text(coalesce(p_ids, '[]'::jsonb)) x where x::uuid is distinct from p_viewer) = 1
$$;

create or replace function public.business_finance(p_period_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := private.require_business_viewer();
  v_org uuid := private.current_org_id();
  v_fin boolean := private.has_permission(v_viewer, 'team.finance.read');
  v_period public.periods := private.resolve_period(p_period_id);
  v_cfg jsonb := private.business_health_config();
  v_tol numeric := (v_cfg ->> 'comparable_length_tolerance')::numeric;
  v_days int := v_period.ends_on - v_period.starts_on + 1;
  v_h jsonb := public.business_health(v_period.id);
  v_cur jsonb := v_h -> 'current';
  v_prev_ok boolean := (v_h -> 'meta' -> 'comparison' -> 'previous' ->> 'available')::boolean;
  v_avg_ok boolean := (v_h -> 'meta' -> 'comparison' -> 'average_3' ->> 'available')::boolean;
  v_prev jsonb; v_avg jsonb; v_metrics jsonb := '[]'::jsonb; v_k text; v_drivers jsonb; v_trend jsonb;
  v_ret_avg numeric;
begin
  v_prev := case when v_prev_ok then v_h -> 'previous' end;
  v_avg := case when v_avg_ok then v_h -> 'average_3' end;

  -- current, previous, average of 3, changes: business_health's own (a hidden figure has none of them)
  foreach v_k in array array['production_minor', 'team_earnings_minor', 'expenses_minor', 'purchases_salon_minor',
                             'operating_costs_minor', 'operating_result_minor', 'free_minor'] loop
    v_metrics := v_metrics || jsonb_build_array(jsonb_build_object(
      'key', v_k, 'current', v_cur -> v_k, 'hidden', v_cur -> 'private_fields' ? v_k,
      'previous', v_prev -> v_k, 'previous_hidden', coalesce(v_prev -> 'private_fields' ? v_k, false),
      'average_3', v_avg -> v_k, 'average_3_hidden', coalesce(v_avg -> 'private_fields' ? v_k, false),
      'change_previous', case when v_cur ->> v_k is not null and v_prev ->> v_k is not null then v_h -> 'changes' -> 'previous' -> v_k end,
      'change_average_3', case when v_cur ->> v_k is not null and v_avg ->> v_k is not null then v_h -> 'changes' -> 'average_3' -> v_k end));
  end loop;
  if (v_avg ->> 'production_minor')::numeric > 0 and v_avg ->> 'operating_result_minor' is not null then
    v_ret_avg := round((v_avg ->> 'operating_result_minor')::numeric * 100 / (v_avg ->> 'production_minor')::numeric, 1);
  end if;

  -- principais movimentos vs the previous comparable period: team earnings, each expense category, salon-funded
  -- purchases; only figures visible in both periods, largest absolute change first
  if v_prev_ok then
    select coalesce(jsonb_agg(d order by abs((d ->> 'delta_minor')::bigint) desc, d ->> 'label'), '[]'::jsonb) into v_drivers
      from (select jsonb_build_object('kind', kind, 'label', label, 'current_minor', cur, 'previous_minor', prev, 'delta_minor', cur - prev,
                                      'percent', case when prev <> 0 then round((cur - prev) * 100.0 / abs(prev), 1) end) as d
              from (select 'team_earnings' as kind, null::text as label, (v_cur ->> 'team_earnings_minor')::bigint as cur, (v_prev ->> 'team_earnings_minor')::bigint as prev
                    union all
                    select 'purchases_salon', null, (v_cur ->> 'purchases_salon_minor')::bigint, (v_prev ->> 'purchases_salon_minor')::bigint
                    union all
                    select 'expense_category', c ->> 'label', (c ->> 'current_minor')::bigint, (c ->> 'previous_minor')::bigint
                      from jsonb_array_elements(v_h -> 'expense_categories') c) x
             where cur is not null and prev is not null and cur <> prev
             order by abs(cur - prev) desc, label limit 3) t;
  end if;

  -- recent periods of comparable length up to the selected one, oldest first; a hidden point is marked, never filled
  select coalesce(jsonb_agg(jsonb_build_object('id', m -> 'period' -> 'id', 'label', m -> 'period' -> 'label', 'state', m -> 'period' -> 'state',
                    'is_complete', m -> 'period' -> 'is_complete', 'production_minor', m -> 'production_minor',
                    'operating_result_minor', m -> 'operating_result_minor', 'retention_pct', m -> 'retention_pct',
                    'private_fields', coalesce((select jsonb_agg(f) from jsonb_array_elements_text(m -> 'private_fields') f
                                                 where f in ('operating_result_minor', 'retention_pct')), '[]'::jsonb))
                  order by m -> 'period' ->> 'starts_on'), '[]'::jsonb)
    into v_trend
    from (select private.business_redact(private.business_period_metrics(v_org, pe), v_fin, v_viewer) as m
            from (select * from public.periods pe
                   where pe.organization_id = v_org and pe.starts_on <= v_period.starts_on
                     and abs((pe.ends_on - pe.starts_on + 1) - v_days) <= v_tol * v_days
                   order by pe.starts_on desc limit (v_cfg ->> 'trend_periods')::int) pe) t;

  return jsonb_build_object(
    'period', v_cur -> 'period',
    'source', v_cur -> 'source',
    'comparison', v_h -> 'meta' -> 'comparison',
    'private_fields', v_cur -> 'private_fields',
    'pending_rules_count', v_cur -> 'pending_rules_count',
    'metrics', v_metrics,
    'indicators', jsonb_build_object(
      'operating_cost_ratio_pct', case when (v_cur ->> 'production_minor')::bigint > 0 and v_cur ->> 'operating_costs_minor' is not null
                                       then round((v_cur ->> 'operating_costs_minor')::numeric * 100 / (v_cur ->> 'production_minor')::numeric, 1) end,
      'retention_pct', v_cur -> 'retention_pct',
      'retention_previous_pct', v_prev -> 'retention_pct',
      'retention_average_3_pct', v_ret_avg,
      -- percentage points; only between two visible values
      'retention_change_previous_pp', case when v_cur ->> 'retention_pct' is not null and v_prev ->> 'retention_pct' is not null
                                           then (v_cur ->> 'retention_pct')::numeric - (v_prev ->> 'retention_pct')::numeric end,
      'retention_change_average_3_pp', case when v_cur ->> 'retention_pct' is not null and v_ret_avg is not null
                                            then (v_cur ->> 'retention_pct')::numeric - v_ret_avg end),
    'result_change', case when v_cur ->> 'operating_result_minor' is not null and v_prev ->> 'operating_result_minor' is not null
                          then v_h -> 'changes' -> 'previous' -> 'operating_result_minor' end,
    'drivers', coalesce(v_drivers, '[]'::jsonb),
    'trend', v_trend,
    'reserve', jsonb_build_object(
      'balance_minor', private.reserve_balance(v_org),
      'allocated_minor', v_cur -> 'reserve_allocated_minor', 'used_minor', v_cur -> 'reserve_used_minor',
      'previous_allocated_minor', v_prev -> 'reserve_allocated_minor', 'previous_used_minor', v_prev -> 'reserve_used_minor'),
    'obligations', jsonb_build_object(
      'state', v_period.state, 'approved', v_cur -> 'approved',
      'paid_team_minor', v_cur -> 'paid_team_minor', 'unpaid_team_minor', v_cur -> 'unpaid_team_minor',
      'free_minor', v_cur -> 'free_minor', 'undistributed_minor', v_cur -> 'undistributed_minor',
      'owners_decision', v_cur -> 'owners_decision'),
    'open_periods', v_h -> 'open_periods');
end $$;

revoke all on function private.business_one_other(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.business_finance(uuid) from public, anon;
grant execute on function public.business_finance(uuid) to authenticated;
