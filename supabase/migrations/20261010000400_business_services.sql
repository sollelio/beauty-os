-- Business Health · Slice 03 (Negócio → Serviços): what customers buy, what generates value, how demand changes.
-- public.business_services(period): per service the active records of the period (count, revenue at the recorded
-- value, average actual ticket, share of production), the same figures for the previous comparable period and the
-- one before it (Slice 01 comparison rule, chained), and the unnamed distribution (largest and two largest shares).
-- No professional identity and no per-person figure is ever returned. Cancelled records never count.
--
-- Privacy (07 D9, B11). A service performed in a period by exactly one person other than the viewer has, as its
-- revenue, that person's production on it; a specialist's whole production would then be visible by name of service,
-- which is the per-person path closed in Equipa. So, for a viewer without team.finance.read, such a service is not
-- shown on its own: it joins "Outros serviços" (count and revenue together). If that group would still be made of
-- exactly one other person, the smallest service performed by two or more others joins it too, so the group never
-- resolves to one person (it can be worked out from the total anyway). A service's figures for a period are only
-- ever returned under that period's own rule, so combining periods exposes nothing more. A team.finance.read holder
-- sees every service.

-- Per service figures of one period, with whether this viewer may see them on their own.
create or replace function private.business_service_figures(p_org uuid, p_period public.periods, p_viewer uuid, p_finance boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  with recs as (
    select r.service_id, r.person_id, r.value_minor from private.active_service_records r join public.organizations o on o.id = r.organization_id
     where r.organization_id = p_org and (r.occurred_at at time zone o.timezone)::date between p_period.starts_on and p_period.ends_on),
  agg as (
    select service_id, count(*)::int as cnt, sum(value_minor)::bigint as revenue,
           count(distinct person_id) filter (where person_id is distinct from p_viewer)::int as others
      from recs group by service_id),
  own as (select a.*, p_finance or a.others <> 1 as shown from agg a),
  grp as (select count(distinct r.person_id) as n from recs r join own a using (service_id) where not a.shown and r.person_id is distinct from p_viewer),
  extra as (select a.service_id from own a where a.shown and a.others >= 2 and (select n from grp) = 1 order by a.revenue, a.service_id limit 1)
  select coalesce(jsonb_agg(jsonb_build_object('service_id', a.service_id, 'name', s.name, 'count', a.cnt, 'revenue_minor', a.revenue,
                                               'visible', a.shown and a.service_id not in (select service_id from extra))
                            order by a.revenue desc, s.name), '[]'::jsonb)
    from own a join public.services s on s.id = a.service_id
$$;

create or replace function public.business_services(p_period_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := private.require_business_viewer();
  v_org uuid := private.current_org_id();
  v_fin boolean := private.has_permission(v_viewer, 'team.finance.read');
  v_period public.periods := private.resolve_period(p_period_id);
  v_p1 public.periods; v_p2 public.periods; v_r1 text; v_r2 text;
  v_cur jsonb; v_f1 jsonb := '[]'; v_f2 jsonb := '[]'; v_pos jsonb; v_total bigint; v_count int; v_top bigint[];
begin
  v_pos := private.business_position(v_org, v_period);
  v_total := (v_pos -> 'production' ->> 'total_minor')::bigint;
  v_count := (v_pos -> 'production' ->> 'count')::int;
  v_cur := private.business_service_figures(v_org, v_period, v_viewer, v_fin);
  select * into v_p1 from private.business_previous_period(v_org, v_period);
  v_r1 := private.business_previous_reason(v_period, v_p1);
  if v_r1 is null then
    v_f1 := private.business_service_figures(v_org, v_p1, v_viewer, v_fin);
    select * into v_p2 from private.business_previous_period(v_org, v_p1);
    v_r2 := private.business_previous_reason(v_p1, v_p2);
    if v_r2 is null then v_f2 := private.business_service_figures(v_org, v_p2, v_viewer, v_fin); end if;
  else
    v_r2 := v_r1;
  end if;
  select coalesce(array_agg((x ->> 'revenue_minor')::bigint order by (x ->> 'revenue_minor')::bigint desc), '{}') into v_top from jsonb_array_elements(v_cur) x;

  return jsonb_build_object(
    'period', jsonb_build_object('id', v_period.id, 'label', v_period.label, 'state', v_period.state, 'starts_on', v_period.starts_on,
                                 'ends_on', v_period.ends_on, 'is_complete', v_r1 is distinct from 'current_incomplete'),
    'summary', jsonb_build_object('production_minor', v_total, 'services_count', v_count,
                                  'average_ticket_minor', case when v_count > 0 then round(v_total::numeric / v_count) end,
                                  'distinct_services', cardinality(v_top),
                                  'top_share_pct', case when v_total > 0 then round(coalesce(v_top[1], 0) * 100.0 / v_total) end,
                                  'top_two_share_pct', case when v_total > 0 then round((coalesce(v_top[1], 0) + coalesce(v_top[2], 0)) * 100.0 / v_total) end),
    'comparison', jsonb_build_object(
      'previous', jsonb_build_object('available', v_r1 is null, 'reason', v_r1,
                                     'period', case when v_p1.id is null then null else jsonb_build_object('id', v_p1.id, 'label', v_p1.label, 'state', v_p1.state) end),
      'before_previous', jsonb_build_object('available', v_r1 is null and v_r2 is null, 'reason', v_r2,
                                     'period', case when v_r1 is not null or v_p2.id is null then null else jsonb_build_object('id', v_p2.id, 'label', v_p2.label, 'state', v_p2.state) end)),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
               'service_id', c ->> 'service_id', 'name', c ->> 'name', 'count', (c ->> 'count')::int, 'revenue_minor', (c ->> 'revenue_minor')::bigint,
               'average_ticket_minor', round((c ->> 'revenue_minor')::numeric / (c ->> 'count')::int),
               'share_pct', case when v_total > 0 then round((c ->> 'revenue_minor')::numeric * 100 / v_total, 1) end,
               'previous', h.prev, 'before_previous', h.prev2,
               'change', case when v_r1 is null and h.prev is not null then jsonb_build_object(
                   'count', private.business_change(c, h.prev, 'count'), 'revenue', private.business_change(c, h.prev, 'revenue_minor')) end)
             order by (c ->> 'revenue_minor')::bigint desc, c ->> 'name')
        from jsonb_array_elements(v_cur) c,
             lateral (select
               -- a reference figure only when this service was shown on its own in that period too; absent = none recorded
               case when v_r1 is not null then null
                    when exists (select 1 from jsonb_array_elements(v_f1) y where y ->> 'service_id' = c ->> 'service_id' and not (y ->> 'visible')::boolean) then null
                    else coalesce((select jsonb_build_object('count', (y ->> 'count')::int, 'revenue_minor', (y ->> 'revenue_minor')::bigint)
                                     from jsonb_array_elements(v_f1) y where y ->> 'service_id' = c ->> 'service_id'), '{"count": 0, "revenue_minor": 0}'::jsonb) end as prev,
               case when v_r1 is not null or v_r2 is not null then null
                    when exists (select 1 from jsonb_array_elements(v_f2) y where y ->> 'service_id' = c ->> 'service_id' and not (y ->> 'visible')::boolean) then null
                    else coalesce((select jsonb_build_object('count', (y ->> 'count')::int, 'revenue_minor', (y ->> 'revenue_minor')::bigint)
                                     from jsonb_array_elements(v_f2) y where y ->> 'service_id' = c ->> 'service_id'), '{"count": 0, "revenue_minor": 0}'::jsonb) end as prev2) h
       where (c ->> 'visible')::boolean), '[]'::jsonb),
    -- services not shown on their own, together (null when there are none)
    'other', (select case when count(*) > 0 then jsonb_build_object('services', count(*), 'count', sum((c ->> 'count')::int),
                                                                     'revenue_minor', sum((c ->> 'revenue_minor')::bigint)) end
                from jsonb_array_elements(v_cur) c where not (c ->> 'visible')::boolean));
end $$;

revoke all on function private.business_service_figures(uuid, public.periods, uuid, boolean) from public, anon, authenticated;
revoke all on function public.business_services(uuid) from public, anon;
grant execute on function public.business_services(uuid) to authenticated;
