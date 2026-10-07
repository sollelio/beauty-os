-- Slice 04 · module `team`: remuneration-rule versions (D4) and the professional situation read model.
-- Authoritative formulas (ADR-0004, 04 J5, 07 D6), per person per period:
--   earned            = rule % × production            (standing rule; undefined while the rule is pending)
--   remaining payable = max(earned − advances − confirmed payments, 0)
--   excess            = max(advances + confirmed payments − earned, 0)   — a review condition only
-- Visibility (07 §8): a private context is required; a person sees their own situation (B3); a person holding
-- 'team.finance.read' sees anyone's in the organization (B4), with attributions. Implementation assumption pending
-- 07 I6: the standing version in force at the period's end applies to the whole period. Contextual rules stay
-- pending here; their per-period decision is a Slice 06 command.

create table public.rule_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  person_id uuid not null,
  kind text not null check (kind in ('standing', 'contextual')),
  percent numeric(5, 2),
  effective_from date not null,
  set_by_person_id uuid not null,
  set_at timestamptz not null default now(),
  check ((kind = 'standing' and percent between 0 and 100) or (kind = 'contextual' and percent is null)),
  unique (person_id, effective_from),
  foreign key (organization_id, person_id) references public.people(organization_id, id),
  foreign key (organization_id, set_by_person_id) references public.people(organization_id, id)
);
alter table public.rule_versions enable row level security;
revoke all on public.rule_versions from anon, authenticated;              -- no grants, no policies

-- Resolve the private viewer for reading p_person_id's situation; raises if not allowed. Returns 'manager' | 'self'.
create or replace function private.situation_view(p_person_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_viewer uuid := private.current_private_person(); v_manager boolean;
begin
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if v_viewer is null then raise exception 'VERIFICATION_REQUIRED'; end if;
  v_manager := private.has_permission(v_viewer, 'team.finance.read');
  if not exists (select 1 from public.people p where p.id = p_person_id and p.organization_id = v_org)
     or (p_person_id <> v_viewer and not v_manager) then
    raise exception 'NOT_AUTHORIZED';                 -- same answer for "not yours" and "not in this organization"
  end if;
  return case when v_manager then 'manager' else 'self' end;
end $$;
revoke all on function private.situation_view(uuid) from public, anon, authenticated;

create or replace function private.resolve_period(p_period_id uuid)
returns public.periods language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_tz text; v_p public.periods;
begin
  select o.timezone into v_tz from public.organizations o where o.id = v_org;
  if p_period_id is not null then
    select * into v_p from public.periods where id = p_period_id and organization_id = v_org;
    if v_p.id is null then raise exception 'CROSS_TENANT_REFERENCE'; end if;     -- unknown or other organization's period
  else
    select * into v_p from public.periods
     where organization_id = v_org and (now() at time zone v_tz)::date between starts_on and ends_on;
    if v_p.id is null then
      select * into v_p from public.periods where organization_id = v_org order by starts_on desc limit 1;
    end if;
  end if;
  if v_p.id is null then raise exception 'PERIOD_NOT_FOUND'; end if;
  return v_p;
end $$;
revoke all on function private.resolve_period(uuid) from public, anon, authenticated;

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
      else jsonb_build_object('kind', v_rule.kind, 'percent', v_rule.percent, 'set_at', v_rule.set_at,
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

-- The records behind each row (Slice 04 S3/S4/V2): services, advances, payments, contributions, newest first.
create or replace function public.team_history(p_person_id uuid, p_period_id uuid default null, p_kind text default null, p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_view text := private.situation_view(p_person_id);
  v_org uuid := private.current_org_id();
  v_period public.periods := private.resolve_period(p_period_id);
  v_tz text; v_rows jsonb; v_total int;
begin
  if p_kind is not null and p_kind not in ('service', 'advance', 'payment', 'contribution') then raise exception 'VALIDATION_FAILED'; end if;
  select o.timezone into v_tz from public.organizations o where o.id = v_org;
  with ev as (
    select 'service' as kind, r.occurred_at, s.name as title,
           case when r.payment_kind = 'mixed' then 'Misto' else (select m.label from public.service_record_payments sp join public.payment_methods m on m.id = sp.payment_method_id where sp.service_record_id = r.id limit 1) end as method_label,
           null::text as confirmed_by, null::text as note, null::jsonb as purchase, r.value_minor as amount_minor
      from public.service_records r join public.services s on s.id = r.service_id
     where r.organization_id = v_org and r.person_id = p_person_id
       and (r.occurred_at at time zone v_tz)::date between v_period.starts_on and v_period.ends_on
    union all
    select 'advance', a.occurred_at, 'Adiantamento', m.label, cb.display_name, a.note, null, a.amount_minor
      from public.advances a join public.payment_methods m on m.id = a.payment_method_id join public.people cb on cb.id = a.confirmed_by_person_id
     where a.organization_id = v_org and a.person_id = p_person_id
       and (a.occurred_at at time zone v_tz)::date between v_period.starts_on and v_period.ends_on
    union all
    select 'payment', p.paid_at, 'Pagamento', m.label, cb.display_name, null, null, p.amount_minor
      from public.payments p join public.payment_methods m on m.id = p.payment_method_id join public.people cb on cb.id = p.confirmed_by_person_id
     where p.organization_id = v_org and p.period_id = v_period.id and p.person_id = p_person_id
    union all
    select 'contribution', pu.occurred_at, 'Contribuição em compra', null, null, null,
           jsonb_build_object('origin', (select o.label from public.purchase_origins o where o.id = pu.origin_id),
                              'line_count', (select count(*) from public.purchase_lines l where l.purchase_id = pu.id),
                              'total_minor', pu.total_minor,
                              'salon_minor', coalesce((select x.amount_minor from public.purchase_contributions x where x.purchase_id = pu.id and x.contributor_kind = 'salon'), 0)),
           c.amount_minor
      from public.purchase_contributions c join public.purchases pu on pu.id = c.purchase_id
     where c.organization_id = v_org and c.person_id = p_person_id
       and (pu.occurred_at at time zone v_tz)::date between v_period.starts_on and v_period.ends_on
  ), filtered as (select * from ev where p_kind is null or kind = p_kind)
  select (select count(*) from filtered),
         coalesce((select jsonb_agg(jsonb_build_object(
                     'kind', f.kind, 'occurred_at', f.occurred_at, 'title', f.title, 'method_label', f.method_label,
                     'confirmed_by', case when v_view = 'manager' then f.confirmed_by end,
                     'note', f.note, 'purchase', f.purchase, 'amount_minor', f.amount_minor) order by f.occurred_at desc)
                   from (select * from filtered order by occurred_at desc limit greatest(p_limit, 0)) f), '[]'::jsonb)
    into v_total, v_rows;
  return jsonb_build_object('view', v_view, 'total_count', v_total, 'rows', v_rows);
end $$;

-- Equipa list for a manager (B4): people of the organization who perform services.
create or replace function public.team_people()
returns table (id uuid, display_name text, capabilities text[])
language plpgsql stable security definer set search_path = '' as $$
declare v_viewer uuid := private.current_private_person();
begin
  if private.current_org_id() is null then raise exception 'NOT_AUTHORIZED'; end if;
  if v_viewer is null then raise exception 'VERIFICATION_REQUIRED'; end if;
  if not private.has_permission(v_viewer, 'team.finance.read') then raise exception 'NOT_AUTHORIZED'; end if;
  return query
    select p.id, p.display_name,
           array(select c.label from public.person_capabilities c where c.person_id = p.id order by c.sort_order, c.label)
    from public.people p
    where p.organization_id = private.current_org_id() and p.active
      and exists (select 1 from public.person_capabilities c where c.person_id = p.id)
    order by p.display_name;
end $$;

-- Period sheet (Slice 04 V3): periods with their state and this person's recorded payment total.
create or replace function public.team_periods(p_person_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_view text := private.situation_view(p_person_id); v_org uuid := private.current_org_id();
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', pe.id, 'label', pe.label, 'state', pe.state, 'starts_on', pe.starts_on, 'ends_on', pe.ends_on,
      'payments_total_minor', (select coalesce(sum(p.amount_minor), 0) from public.payments p where p.period_id = pe.id and p.person_id = p_person_id))
      order by pe.starts_on desc)
    from public.periods pe where pe.organization_id = v_org), '[]'::jsonb);
end $$;

revoke all on function public.team_situation(uuid, uuid), public.team_history(uuid, uuid, text, int), public.team_people(),
  public.team_periods(uuid) from public, anon;
grant execute on function public.team_situation(uuid, uuid), public.team_history(uuid, uuid, text, int), public.team_people(),
  public.team_periods(uuid) to authenticated;
