-- Business Health · Slice 04 (Negócio → Custos & Stock): where the money goes, what changed, which products keep
-- coming back. public.business_costs(period) for a business.health.read holder; no team.finance.read needed.
--
-- Reuse, not a second model: the period figures, the expense categories with their previous / average-of-3 references
-- and the comparison rule are business_health's own (Slice 01, ADR-0004); this read adds the shares, the salon-funded
-- purchases per product and the Stock Lite signals.
--   Despesas      active expenses (cancelled never count), by category; share of expenses and of production.
--   Compras       only the salon-funded part counts (purchase total − what people contributed, as Fecho does). Per
--                 product it is that part spread over the purchase's lines in proportion to their cost. The gross
--                 total and the contributed part are never returned (nor who contributed): one minus the other would
--                 be a person's contribution.
--   Stock         Stock Lite as it is: the human-set state now (ok / baixo / comprar, on the list, urgent), and over
--                 the last `product_window_days` days up to the period's end how often a product was bought and how
--                 often it was marked baixo/comprar. No quantities on hand, no consumption, no forecast.

create or replace function private.business_health_config()
returns jsonb language sql immutable as $$
  select jsonb_build_object('comparable_length_tolerance', 0.25, 'average_window', 3, 'trend_periods', 6, 'product_window_days', 30)
$$;

create or replace function public.business_costs(p_period_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := private.require_business_viewer();
  v_org uuid := private.current_org_id();
  v_period public.periods := private.resolve_period(p_period_id);
  v_h jsonb := public.business_health(v_period.id);
  v_tz text; v_cur jsonb := v_h -> 'current'; v_prod bigint; v_exp bigint; v_pur bigint;
  v_days int := (private.business_health_config() ->> 'product_window_days')::int; v_to date; v_from date; v_products jsonb; v_activity jsonb;
begin
  select o.timezone into v_tz from public.organizations o where o.id = v_org;
  v_prod := (v_cur ->> 'production_minor')::bigint; v_exp := (v_cur ->> 'expenses_minor')::bigint; v_pur := (v_cur ->> 'purchases_salon_minor')::bigint;
  v_to := least(v_period.ends_on, (now() at time zone v_tz)::date); v_from := v_to - (v_days - 1);

  -- salon-funded part per product in the period
  with pur as (
    select pu.id, pu.total_minor, pu.occurred_at,
           pu.total_minor - coalesce((select sum(c.amount_minor) from public.purchase_contributions c
                                       where c.purchase_id = pu.id and c.contributor_kind = 'person'), 0) as salon
      from private.active_purchases pu
     where pu.organization_id = v_org and (pu.occurred_at at time zone v_tz)::date between v_period.starts_on and v_period.ends_on),
  lines as (
    select l.product_id, l.quantity, p.occurred_at, round(l.line_cost_minor::numeric * p.salon / p.total_minor) as salon
      from pur p join public.purchase_lines l on l.purchase_id = p.id)
  select coalesce(jsonb_agg(jsonb_build_object('product_id', x.product_id, 'name', pr.name, 'unit_word', pr.unit_word, 'purchases_count', x.n,
                                               'quantity', x.qty, 'salon_minor', x.salon, 'last_purchased_at', x.last)
                            order by x.salon desc, pr.name), '[]'::jsonb)
    into v_products
    from (select product_id, count(*)::int as n, sum(quantity)::int as qty, sum(salon)::bigint as salon, max(occurred_at) as last
            from lines group by product_id) x
    join public.products pr on pr.id = x.product_id;

  -- products bought or marked in the window up to the period's end (any product with either)
  select coalesce(jsonb_agg(a order by (a ->> 'purchases') desc, (a ->> 'marks') desc, a ->> 'name'), '[]'::jsonb) into v_activity
    from (select jsonb_build_object('product_id', pr.id, 'name', pr.name, 'purchases', b.n, 'marks', m.n,
                                    'last_purchased_at', (select max(pu.occurred_at) from private.active_purchases pu join public.purchase_lines l on l.purchase_id = pu.id
                                                           where l.product_id = pr.id)) as a
            from public.products pr,
                 lateral (select count(*)::int as n from private.active_purchases pu join public.purchase_lines l on l.purchase_id = pu.id
                           where l.product_id = pr.id and (pu.occurred_at at time zone v_tz)::date between v_from and v_to) b,
                 lateral (select count(*)::int as n from public.product_state_changes sc
                           where sc.product_id = pr.id and sc.to_state in ('baixo', 'comprar') and sc.to_state is distinct from sc.from_state
                             and (sc.changed_at at time zone v_tz)::date between v_from and v_to) m
           where pr.organization_id = v_org and (b.n > 0 or m.n > 0)) t(a);

  return jsonb_build_object(
    'period', jsonb_build_object('id', v_period.id, 'label', v_period.label, 'state', v_period.state, 'starts_on', v_period.starts_on,
                                 'ends_on', v_period.ends_on, 'is_complete', (v_cur -> 'period' ->> 'is_complete')::boolean),
    'comparison', v_h -> 'meta' -> 'comparison',
    'summary', jsonb_build_object('production_minor', v_prod, 'expenses_minor', v_exp, 'purchases_salon_minor', v_pur,
                                  'expenses_pct_of_production', case when v_prod > 0 then round(v_exp * 100.0 / v_prod, 1) end,
                                  'purchases_pct_of_production', case when v_prod > 0 then round(v_pur * 100.0 / v_prod, 1) end,
                                  'products_attention', (select count(*) from public.products p where p.organization_id = v_org and (p.state <> 'ok' or p.urgent))),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object('category_id', c ->> 'category_id', 'label', c ->> 'label', 'current_minor', (c ->> 'current_minor')::bigint,
               'share_of_expenses_pct', case when v_exp > 0 then round((c ->> 'current_minor')::numeric * 100 / v_exp, 1) end,
               'share_of_production_pct', case when v_prod > 0 then round((c ->> 'current_minor')::numeric * 100 / v_prod, 1) end,
               'previous_minor', (c ->> 'previous_minor')::bigint, 'average_3_minor', (c ->> 'average_3_minor')::bigint,
               'reference_presence', (c ->> 'reference_presence')::int,
               'change_previous', case when (v_h -> 'meta' -> 'comparison' -> 'previous' ->> 'available')::boolean
                                       then private.business_change(c, c || jsonb_build_object('current_minor', c -> 'previous_minor'), 'current_minor') end,
               'change_average_3', case when (v_h -> 'meta' -> 'comparison' -> 'average_3' ->> 'available')::boolean
                                        then private.business_change(c, c || jsonb_build_object('current_minor', c -> 'average_3_minor'), 'current_minor') end)
             order by (c ->> 'current_minor')::bigint desc, c ->> 'label')
        from jsonb_array_elements(v_h -> 'expense_categories') c where (c ->> 'current_minor')::bigint > 0
           or (c ->> 'previous_minor')::bigint > 0 or (c ->> 'average_3_minor')::bigint > 0), '[]'::jsonb),
    'purchases', jsonb_build_object(
      'salon_minor', v_pur,
      'previous_salon_minor', v_h -> 'previous' -> 'purchases_salon_minor',
      'change', v_h -> 'changes' -> 'previous' -> 'purchases_salon_minor',
      'products', v_products),
    'stock', jsonb_build_object(
      'baixo', (select count(*) from public.products p where p.organization_id = v_org and p.state = 'baixo'),
      'comprar', (select count(*) from public.products p where p.organization_id = v_org and p.state = 'comprar'),
      'on_list', (select count(*) from public.products p where p.organization_id = v_org and p.on_list),
      'urgent', (select count(*) from public.products p where p.organization_id = v_org and p.urgent),
      'attention', coalesce((select jsonb_agg(jsonb_build_object('product_id', p.id, 'name', p.name, 'state', p.state, 'on_list', p.on_list, 'urgent', p.urgent)
                                              order by p.urgent desc, p.state desc, lower(p.name))
                               from public.products p where p.organization_id = v_org and (p.state <> 'ok' or p.urgent)), '[]'::jsonb),
      'window', jsonb_build_object('days', v_days, 'from', v_from, 'to', v_to),
      'activity', v_activity));
end $$;

revoke all on function public.business_costs(uuid) from public, anon;
grant execute on function public.business_costs(uuid) to authenticated;
