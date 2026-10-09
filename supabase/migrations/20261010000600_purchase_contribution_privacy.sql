-- Business Health · purchase contributions are not inferable (07 D9, B11) · Stock Lite ignores cancelled purchases.
--
-- 1. The shared Stock screen shows each purchase's line cost (kept: operational). The salon-funded part of the period's
--    purchases is the total minus what people contributed, so together they give the period's contributions. For a
--    viewer without team.finance.read, wherever those contributions come from exactly one person other than the viewer
--    (the viewer knows their own), the salon-funded figure is hidden — and with it every figure that contains it
--    (operating costs, result, retention, Livre), its comparisons, averages and trend values (business_health), and in
--    business_costs its share of production, the per-product salon-funded values and the "purchases up" insight. With
--    two or more other contributors the aggregate stays. A team.finance.read holder sees everything.
-- 2. A cancelled purchase is not a purchase: Stock's last purchase, "bought today", purchase history, the mark's
--    "days after purchase" and the planned-quantity prefill read active purchases only.

create or replace function private.business_period_metrics(p_org uuid, p_period public.periods)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text; v_today date; v_stmt public.period_close_statements; v_pos jsonb; v_closed boolean; v_appr public.period_approvals;
  v_lines jsonb; v_unpaid bigint; v_prod bigint; v_pending int; v_team bigint; v_exp bigint; v_pur bigint; v_costs bigint; v_result bigint;
  v_earners jsonb; v_owed jsonb; v_contributors jsonb;
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
  select coalesce(jsonb_agg(distinct c.person_id), '[]'::jsonb) into v_contributors
    from private.active_purchases pu join public.purchase_contributions c on c.purchase_id = pu.id
   where pu.organization_id = p_org and c.contributor_kind = 'person'
     and (pu.occurred_at at time zone v_tz)::date between p_period.starts_on and p_period.ends_on;
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
    '_earners', v_earners, '_owed', coalesce(v_owed, '[]'::jsonb), '_contributors', v_contributors,
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
    if (select count(*) from jsonb_array_elements_text(p_m -> '_earners') x where x::uuid is distinct from p_viewer) = 1 then
      v_hide := v_hide || array['team_earnings_minor', 'operating_costs_minor', 'operating_result_minor', 'retention_pct', 'free_minor'];
    end if;
    if (select count(*) from jsonb_array_elements_text(p_m -> '_owed') x where x::uuid is distinct from p_viewer) = 1 then
      v_hide := v_hide || array['unpaid_team_minor'];
    end if;
    -- salon-funded purchases = purchase total − personal contributions; with line costs on the shared Stock screen,
    -- they give the contributions, so they (and every figure that contains them) are hidden where those resolve to
    -- one person other than the viewer
    if (select count(*) from jsonb_array_elements_text(p_m -> '_contributors') x where x::uuid is distinct from p_viewer) = 1 then
      v_hide := v_hide || array['purchases_salon_minor', 'operating_costs_minor', 'operating_result_minor', 'retention_pct', 'free_minor'];
    end if;
  end if;
  v_out := p_m - '_earners' - '_owed' - '_contributors';
  -- only a figure that exists is hidden; one that is undefined (a rule pending) stays undefined
  v_hide := array(select k from unnest(v_hide) with ordinality t(k, n) where v_out ->> k is not null group by k order by min(n));
  foreach v_k in array v_hide loop v_out := v_out || jsonb_build_object(v_k, null); end loop;
  return v_out || jsonb_build_object('private_fields', to_jsonb(v_hide));
end $$;

create or replace function public.business_costs(p_period_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := private.require_business_viewer();
  v_org uuid := private.current_org_id();
  v_period public.periods := private.resolve_period(p_period_id);
  v_h jsonb := public.business_health(v_period.id);
  v_tz text; v_cur jsonb := v_h -> 'current'; v_prod bigint; v_exp bigint; v_pur bigint;
  v_hidden boolean := v_h -> 'current' -> 'private_fields' ? 'purchases_salon_minor';
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
                                               'quantity', x.qty, 'salon_minor', case when not v_hidden then x.salon end, 'last_purchased_at', x.last)
                            order by case when not v_hidden then x.salon end desc nulls last, x.n desc, pr.name), '[]'::jsonb)
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
                                  'purchases_private', v_hidden,
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
      'private', v_hidden,
      'previous_private', coalesce(v_h -> 'previous' -> 'private_fields' ? 'purchases_salon_minor', false),
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

create or replace function public.stock_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_tz text;
begin
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  select o.timezone into v_tz from public.organizations o where o.id = v_org;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'unit_word', p.unit_word, 'purpose', p.purpose,
      'state', p.state, 'level', p.level, 'reserve_units', p.reserve_units, 'marked_at', p.marked_at,
      'on_list', p.on_list, 'planned_qty', p.planned_qty, 'urgent', p.urgent,
      'last_purchase', (select jsonb_build_object('occurred_at', pu.occurred_at, 'quantity', l.quantity, 'unit_word', l.unit_word,
                                                  'line_cost_minor', l.line_cost_minor, 'origin', o.label)
                          from public.purchase_lines l join private.active_purchases pu on pu.id = l.purchase_id
                          left join public.purchase_origins o on o.id = pu.origin_id
                         where l.product_id = p.id order by pu.occurred_at desc limit 1),
      'bought_today', (select jsonb_build_object('quantity', sum(l.quantity), 'unit_word', p.unit_word)
                         from public.purchase_lines l join private.active_purchases pu on pu.id = l.purchase_id
                        where l.product_id = p.id
                          and (pu.occurred_at at time zone v_tz)::date = (now() at time zone v_tz)::date
                       having count(*) > 0))
      order by lower(p.name))
    from public.products p where p.organization_id = v_org), '[]'::jsonb);
end $$;

create or replace function public.product_purchase_history(p_product_id uuid, p_limit int default 5)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_p public.products; v_tz text; v_last date;
begin
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  select * into v_p from public.products where id = p_product_id and organization_id = v_org;
  if v_p.id is null then raise exception 'CROSS_TENANT_REFERENCE'; end if;
  select o.timezone into v_tz from public.organizations o where o.id = v_org;
  if v_p.marked_at is not null then
    select max((pu.occurred_at at time zone v_tz)::date) into v_last
      from public.purchase_lines l join private.active_purchases pu on pu.id = l.purchase_id
     where l.product_id = v_p.id and pu.occurred_at <= v_p.marked_at;
  end if;
  return jsonb_build_object(
    'purchases', coalesce((select jsonb_agg(x order by x ->> 'occurred_at' desc) from (
        select jsonb_build_object('occurred_at', pu.occurred_at, 'quantity', l.quantity, 'unit_word', l.unit_word,
                                  'line_cost_minor', l.line_cost_minor, 'origin', o.label) as x
          from public.purchase_lines l join private.active_purchases pu on pu.id = l.purchase_id
          left join public.purchase_origins o on o.id = pu.origin_id
         where l.product_id = v_p.id order by pu.occurred_at desc limit greatest(p_limit, 0)) h), '[]'::jsonb),
    'mark', case when v_p.marked_at is null then null else jsonb_build_object(
        'state', v_p.state, 'marked_at', v_p.marked_at,
        'days_after_purchase', (v_p.marked_at at time zone v_tz)::date - v_last) end);
end $$;

create or replace function private.products_stock_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.state is distinct from old.state then
    new.marked_at := case when new.state = 'ok' then null else now() end;
  end if;
  if new.urgent and not old.urgent then new.on_list := true; end if;           -- urgent means "buy now": on the list
  if not new.on_list then
    new.urgent := false; new.planned_qty := null;                               -- off the list, the plan ends
  elsif new.planned_qty is null then                                            -- prefill from the last purchase (Q2)
    new.planned_qty := coalesce((
      select l.quantity from public.purchase_lines l join private.active_purchases pu on pu.id = l.purchase_id
       where l.product_id = new.id order by pu.occurred_at desc limit 1), 1);
  end if;
  if (new.state, new.level, new.reserve_units, new.on_list, new.planned_qty, new.urgent, new.purpose)
     is distinct from (old.state, old.level, old.reserve_units, old.on_list, old.planned_qty, old.urgent, old.purpose) then
    new.stock_updated_at := now();
  end if;
  return new;
end $$;
