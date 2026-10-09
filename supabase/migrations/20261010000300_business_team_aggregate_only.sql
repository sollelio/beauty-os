-- Business Health · Equipa without named per-person money for business-only viewers (07 D9, B11).
-- With team earnings visible in periods of several earners, a named per-person production (or a named share, or a
-- named service count where every service has the same price) in each period is one equation per period in each
-- person's percentage: over a few periods the percentages, and so the pay, can be solved. So for a viewer without
-- team.finance.read, business_team returns the team as a whole only: production, services, average ticket, active
-- professionals and the unnamed distribution (largest and two largest shares, whole percent). The named rows (and
-- their comparisons) stay for team.finance.read holders, who already see each person's situation.

create or replace function public.business_team(p_period_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := private.require_business_viewer();
  v_org uuid := private.current_org_id();
  v_period public.periods := private.resolve_period(p_period_id);
  v_fin boolean := private.has_permission(v_viewer, 'team.finance.read');
  v_prev_p public.periods; v_reason text; v_pos jsonb; v_prev_pos jsonb; v_total bigint; v_count int; v_top bigint[];
begin
  v_pos := private.business_position(v_org, v_period);
  v_total := (v_pos -> 'production' ->> 'total_minor')::bigint;
  v_count := (v_pos -> 'production' ->> 'count')::int;
  select * into v_prev_p from private.business_previous_period(v_org, v_period);
  v_reason := private.business_previous_reason(v_period, v_prev_p);
  if v_reason is null and v_fin then v_prev_pos := private.business_position(v_org, v_prev_p); end if;
  select coalesce(array_agg(t.prod order by t.prod desc), '{}') into v_top
    from (select (x -> 'production' ->> 'total_minor')::bigint as prod from jsonb_array_elements(v_pos -> 'people') x
           where (x -> 'production' ->> 'count')::int > 0) t;

  return jsonb_build_object(
    'period', jsonb_build_object('id', v_period.id, 'label', v_period.label, 'state', v_period.state, 'starts_on', v_period.starts_on,
                                 'ends_on', v_period.ends_on, 'is_complete', private.business_previous_reason(v_period, v_prev_p) is distinct from 'current_incomplete'),
    'summary', jsonb_build_object('production_minor', v_total, 'services_count', v_count,
                                  'average_ticket_minor', case when v_count > 0 then round(v_total::numeric / v_count) end,
                                  'active_count', cardinality(v_top),
                                  -- distribution in whole percent, unnamed: bounds the largest contributions, never gives an amount
                                  'top_share_pct', case when v_total > 0 then round(coalesce(v_top[1], 0) * 100.0 / v_total) end,
                                  'top_two_share_pct', case when v_total > 0 then round((coalesce(v_top[1], 0) + coalesce(v_top[2], 0)) * 100.0 / v_total) end),
    'comparison', jsonb_build_object('available', v_reason is null, 'reason', v_reason,
                                     'period', case when v_prev_p.id is null then null else jsonb_build_object('id', v_prev_p.id, 'label', v_prev_p.label, 'state', v_prev_p.state) end),
    -- named per-professional figures only for team.finance.read (null otherwise: see the header)
    'people', case when v_fin then coalesce((
      select jsonb_agg(jsonb_build_object(
               'person_id', t.person_id, 'display_name', t.display_name, 'services_count', t.cnt, 'production_minor', t.prod,
               'average_ticket_minor', round(t.prod::numeric / t.cnt),
               'share_pct', case when v_total > 0 then round(t.prod * 100.0 / v_total, 1) end,
               'previous_production_minor', t.prev,
               'change', case when v_reason is null then private.business_change(jsonb_build_object('v', t.prod), jsonb_build_object('v', t.prev), 'v') end)
             order by t.prod desc, t.display_name)
        from (select x ->> 'person_id' as person_id, x ->> 'display_name' as display_name,
                     (x -> 'production' ->> 'count')::int as cnt, (x -> 'production' ->> 'total_minor')::bigint as prod,
                     case when v_reason is null then coalesce((select (y -> 'production' ->> 'total_minor')::bigint from jsonb_array_elements(v_prev_pos -> 'people') y
                                                                where y ->> 'person_id' = x ->> 'person_id'), 0) end as prev
                from jsonb_array_elements(v_pos -> 'people') x where (x -> 'production' ->> 'count')::int > 0) t), '[]'::jsonb) end);
end $$;
