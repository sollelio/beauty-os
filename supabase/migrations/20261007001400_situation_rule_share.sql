-- Slice 04: the rule row shows both shares ("70% para si · 30% para o salão"); the salon share is derived here so
-- no rule arithmetic lives in the client (ADR-0004). Same function otherwise; grants are unchanged by replace.

create or replace function public.team_situation(p_person_id uuid, p_period_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_view text := private.situation_view(p_person_id);
  v_org uuid := private.current_org_id();
  v_period public.periods := private.resolve_period(p_period_id);
  v_tz text; v_rule public.rule_versions;
  v_prod_count int; v_prod bigint; v_adv_count int; v_adv bigint; v_pay_count int; v_pay bigint;
  v_contrib_count int; v_contrib bigint; v_earned bigint; v_last jsonb;
begin
  select o.timezone into v_tz from public.organizations o where o.id = v_org;

  select count(*), coalesce(sum(r.value_minor), 0) into v_prod_count, v_prod
    from public.service_records r
   where r.organization_id = v_org and r.person_id = p_person_id
     and (r.occurred_at at time zone v_tz)::date between v_period.starts_on and v_period.ends_on;

  select count(*), coalesce(sum(a.amount_minor), 0) into v_adv_count, v_adv
    from public.advances a
   where a.organization_id = v_org and a.person_id = p_person_id
     and (a.occurred_at at time zone v_tz)::date between v_period.starts_on and v_period.ends_on;

  select count(*), coalesce(sum(p.amount_minor), 0) into v_pay_count, v_pay
    from public.payments p where p.organization_id = v_org and p.period_id = v_period.id and p.person_id = p_person_id;

  select jsonb_build_object('paid_at', p.paid_at, 'method_label', m.label,
           'confirmed_by', case when v_view = 'manager' then cb.display_name end)
    into v_last
    from public.payments p join public.payment_methods m on m.id = p.payment_method_id
    join public.people cb on cb.id = p.confirmed_by_person_id
   where p.organization_id = v_org and p.period_id = v_period.id and p.person_id = p_person_id
   order by p.paid_at desc limit 1;

  select count(*), coalesce(sum(c.amount_minor), 0) into v_contrib_count, v_contrib
    from public.purchase_contributions c join public.purchases pu on pu.id = c.purchase_id
   where c.organization_id = v_org and c.person_id = p_person_id
     and (pu.occurred_at at time zone v_tz)::date between v_period.starts_on and v_period.ends_on;

  select * into v_rule from public.rule_versions rv
   where rv.organization_id = v_org and rv.person_id = p_person_id and rv.effective_from <= v_period.ends_on
   order by rv.effective_from desc limit 1;

  if v_rule.kind = 'standing' then
    v_earned := round(v_prod * v_rule.percent / 100);
  end if;                                             -- contextual or no rule: earned stays undefined

  return jsonb_build_object(
    'view', v_view,
    'person', (select jsonb_build_object('id', p.id, 'display_name', p.display_name,
                 'capabilities', (select coalesce(jsonb_agg(c.label order by c.sort_order, c.label), '[]'::jsonb)
                                    from public.person_capabilities c where c.person_id = p.id))
               from public.people p where p.id = p_person_id),
    'period', jsonb_build_object('id', v_period.id, 'label', v_period.label, 'state', v_period.state,
                                 'starts_on', v_period.starts_on, 'ends_on', v_period.ends_on),
    'production', jsonb_build_object('count', v_prod_count, 'total_minor', v_prod),
    'rule', case
      when v_rule.id is null then jsonb_build_object('kind', 'none')
      else jsonb_build_object('kind', v_rule.kind, 'percent', v_rule.percent, 'salon_percent', 100 - v_rule.percent, 'set_at', v_rule.set_at,
             'set_by', case when v_view = 'manager' then (select display_name from public.people where id = v_rule.set_by_person_id) end)
    end,
    'earned_minor', v_earned,
    'advances', jsonb_build_object('count', v_adv_count, 'total_minor', v_adv),
    'payments', jsonb_build_object('count', v_pay_count, 'total_minor', v_pay, 'last', v_last),
    'difference_minor', case when v_earned is not null then v_earned - v_adv - v_pay end,
    'remaining_minor', case when v_earned is not null then greatest(v_earned - v_adv - v_pay, 0) end,
    'excess_minor', case when v_earned is not null then greatest(v_adv + v_pay - v_earned, 0) end,
    'contributions', jsonb_build_object('count', v_contrib_count, 'total_minor', v_contrib));
end $$;
