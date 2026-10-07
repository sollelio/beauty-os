-- Slice 06 · module `period`: Fecho do período.
-- Records: contextual-rule decisions, owners' decision (D3), reserve allocations and uses (D1), approvals with
-- immutable per-person outputs and their annulment, payments against an approval, state transitions, close
-- statements (ADR-0007). Review revision per period (ADR-0005 R-1…R-4). One calculation layer for every figure
-- (ADR-0004): person_period_figures → period_position, used by the situation (Slice 04), Fecho read models,
-- previews and commands. All records are append-only; browser roles have no direct access to any of them.
--
-- Open product questions NOT decided here (07 §5.2): reopen target state (I3) — no reopen command exists;
-- partial payments (I2) — a payment may not exceed the approved remainder, a lower one is recorded; annulment
-- guard / approval granularity (I4) — period-level approval, annulment only before any payment; closing without an
-- owners' decision (I5) — not blocked; records entering an approved period (I1/P11) — accepted, revision changes.

-- ---------------------------------------------------------------------------------------------------------------
-- Period: review revision and the event → period resolution
alter table public.periods add column review_revision bigint not null default 0;

create or replace function private.calculation_version() returns text language sql immutable as $$ select '2026-10.1'::text $$;

create or replace function private.period_for(p_org uuid, p_at timestamptz)
returns uuid language sql stable security definer set search_path = '' as $$
  select pe.id from public.periods pe join public.organizations o on o.id = pe.organization_id
   where pe.organization_id = p_org and (p_at at time zone o.timezone)::date between pe.starts_on and pe.ends_on
   order by pe.starts_on desc limit 1
$$;

-- Serialize on the period (R-4), refuse a closed one, and advance the revision (R-1). Returns the new revision.
create or replace function private.touch_period(p_period_id uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_state text; v_rev bigint;
begin
  select state into v_state from public.periods where id = p_period_id for update;
  if v_state = 'fechado' then raise exception 'PERIOD_CLOSED'; end if;
  update public.periods set review_revision = review_revision + 1 where id = p_period_id returning review_revision into v_rev;
  return v_rev;
end $$;

-- Earlier-slice records (services, advances, expenses, purchases) change the review of the period they fall in, in
-- the same transaction as the command that records them. A closed period accepts no new records.
create or replace function private.touch_period_of_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_period uuid := private.period_for(new.organization_id, new.occurred_at);
begin
  if v_period is not null then perform private.touch_period(v_period); end if;
  return null;
end $$;
create trigger service_records_touch_period after insert on public.service_records for each row execute function private.touch_period_of_event();
create trigger advances_touch_period after insert on public.advances for each row execute function private.touch_period_of_event();
create trigger expenses_touch_period after insert on public.expenses for each row execute function private.touch_period_of_event();
create trigger purchases_touch_period after insert on public.purchases for each row execute function private.touch_period_of_event();

-- A standing-rule version changes every open period it applies to (closed periods keep their statement).
create or replace function private.touch_periods_of_rule()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.periods set review_revision = review_revision + 1
   where organization_id = new.organization_id and state <> 'fechado' and ends_on >= new.effective_from;
  return null;
end $$;
create trigger rule_versions_touch_periods after insert or update on public.rule_versions for each row execute function private.touch_periods_of_rule();
revoke all on function private.period_for(uuid, timestamptz), private.touch_period(uuid), private.touch_period_of_event(),
  private.touch_periods_of_rule() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Person dimension used by Fecho: ownership (00 §5; independent of role, permission and rule). Configuration is not
-- designed (07 I7); seeded only.
create table public.person_ownerships (
  organization_id uuid not null,
  person_id uuid primary key,
  foreign key (organization_id, person_id) references public.people(organization_id, id)
);

-- Records -------------------------------------------------------------------------------------------------------
create table public.period_rule_decisions (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  organization_id uuid not null,
  period_id uuid not null,
  person_id uuid not null,
  percent numeric(5, 2) not null check (percent between 0 and 100),
  previous_percent numeric(5, 2),                   -- the rule this decision replaced ("Regra alterada · de 50% para 40%")
  decided_by_person_id uuid not null,
  decided_at timestamptz not null default now(),
  command_id uuid not null unique,
  foreign key (organization_id, period_id) references public.periods(organization_id, id),
  foreign key (organization_id, person_id) references public.people(organization_id, id),
  foreign key (organization_id, decided_by_person_id) references public.people(organization_id, id)
);

create table public.owners_decisions (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  organization_id uuid not null,
  period_id uuid not null,
  kind text not null check (kind in ('none', 'amount')),
  amount_minor bigint,
  check ((kind = 'none' and amount_minor is null) or (kind = 'amount' and amount_minor > 0)),
  decided_by_person_id uuid not null,
  decided_at timestamptz not null default now(),
  command_id uuid not null unique,
  foreign key (organization_id, period_id) references public.periods(organization_id, id),
  foreign key (organization_id, decided_by_person_id) references public.people(organization_id, id)
);

create table public.reserve_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  period_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  note text check (note is null or char_length(note) <= 60),
  confirmed_by_person_id uuid not null,
  occurred_at timestamptz not null default now(),
  command_id uuid not null unique,
  foreign key (organization_id, period_id) references public.periods(organization_id, id),
  foreign key (organization_id, confirmed_by_person_id) references public.people(organization_id, id)
);

create table public.reserve_uses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  period_id uuid not null,                          -- the period of the expense / purchase it pays (D1)
  expense_id uuid references public.expenses(id),
  purchase_id uuid references public.purchases(id),
  check ((expense_id is null) <> (purchase_id is null)),
  amount_minor bigint not null check (amount_minor > 0),
  confirmed_by_person_id uuid not null,
  occurred_at timestamptz not null default now(),
  command_id uuid not null unique,
  foreign key (organization_id, period_id) references public.periods(organization_id, id),
  foreign key (organization_id, confirmed_by_person_id) references public.people(organization_id, id)
);

create table public.period_approvals (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  organization_id uuid not null,
  period_id uuid not null,
  approved_by_person_id uuid not null,
  approved_at timestamptz not null default now(),
  review_revision bigint not null,                  -- the revision that was reviewed and approved (ADR-0007)
  calculation_version text not null,
  totals jsonb not null,                            -- the period position shown at approval
  cases jsonb not null,                             -- acknowledged review cases (advances above earned)
  command_id uuid not null unique,
  unique (organization_id, id),
  foreign key (organization_id, period_id) references public.periods(organization_id, id),
  foreign key (organization_id, approved_by_person_id) references public.people(organization_id, id)
);

-- Immutable approved outputs per person (F-G8): what was approved, never re-derived.
create table public.period_approval_lines (
  approval_id uuid not null,
  organization_id uuid not null,
  person_id uuid not null,
  display_name text not null,
  production_count int not null,
  production_minor bigint not null,
  rule_kind text not null,
  percent numeric(5, 2) not null,
  earned_minor bigint not null,
  advances_minor bigint not null,
  payments_minor bigint not null,
  approved_minor bigint not null check (approved_minor >= 0),   -- remaining payable at approval
  excess_minor bigint not null,
  primary key (approval_id, person_id),
  foreign key (organization_id, approval_id) references public.period_approvals(organization_id, id),
  foreign key (organization_id, person_id) references public.people(organization_id, id)
);

create table public.period_approval_annulments (
  approval_id uuid primary key,
  organization_id uuid not null,
  annulled_by_person_id uuid not null,
  annulled_at timestamptz not null default now(),
  review_revision bigint not null,
  command_id uuid not null unique,
  foreign key (organization_id, approval_id) references public.period_approvals(organization_id, id),
  foreign key (organization_id, annulled_by_person_id) references public.people(organization_id, id)
);

create table public.period_transitions (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  period_id uuid not null,
  from_state text not null,
  to_state text not null,
  actor_person_id uuid,
  at timestamptz not null default now(),
  reason text,
  review_revision bigint not null,
  command_id uuid,
  foreign key (organization_id, period_id) references public.periods(organization_id, id)
);

create table public.period_close_statements (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  organization_id uuid not null,
  period_id uuid not null,
  closed_by_person_id uuid not null,
  closed_at timestamptz not null default now(),
  review_revision bigint not null,
  calculation_version text not null,
  statement jsonb not null,
  command_id uuid not null unique,
  foreign key (organization_id, period_id) references public.periods(organization_id, id),
  foreign key (organization_id, closed_by_person_id) references public.people(organization_id, id)
);

-- Payments to professionals exist only against an approval (Architecture Definition §6).
alter table public.payments add column approval_id uuid references public.period_approvals(id);

do $$
declare t text;
begin
  foreach t in array array['person_ownerships', 'period_rule_decisions', 'owners_decisions', 'reserve_allocations', 'reserve_uses',
    'period_approvals', 'period_approval_lines', 'period_approval_annulments', 'period_transitions', 'period_close_statements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Calculation layer (ADR-0004): one implementation, explicit organization and period, no actor checks.
--   earned            = rule % × production                       (undefined while the rule is pending)
--   remaining payable = max(earned − advances − confirmed payments, 0)       (04 J5)
--   excess            = max(advances + confirmed payments − earned, 0)       (D6 — a review condition only)
create or replace function private.person_period_figures(p_org uuid, p_period public.periods, p_person uuid, p_override numeric default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text; v_rule public.rule_versions; v_dec public.period_rule_decisions; v_kind text; v_pct numeric; v_decided boolean := false;
  v_set_at timestamptz; v_set_by uuid; v_pc int; v_p bigint; v_ac int; v_a bigint; v_yc int; v_y bigint; v_cc int; v_c bigint;
  v_e bigint; v_last jsonb;
begin
  select o.timezone into v_tz from public.organizations o where o.id = p_org;

  select count(*), coalesce(sum(r.value_minor), 0) into v_pc, v_p from public.service_records r
   where r.organization_id = p_org and r.person_id = p_person
     and (r.occurred_at at time zone v_tz)::date between p_period.starts_on and p_period.ends_on;
  select count(*), coalesce(sum(a.amount_minor), 0) into v_ac, v_a from public.advances a
   where a.organization_id = p_org and a.person_id = p_person
     and (a.occurred_at at time zone v_tz)::date between p_period.starts_on and p_period.ends_on;
  select count(*), coalesce(sum(y.amount_minor), 0) into v_yc, v_y from public.payments y
   where y.organization_id = p_org and y.period_id = p_period.id and y.person_id = p_person;
  select jsonb_build_object('paid_at', y.paid_at, 'method_label', m.label, 'confirmed_by', cb.display_name) into v_last
    from public.payments y join public.payment_methods m on m.id = y.payment_method_id join public.people cb on cb.id = y.confirmed_by_person_id
   where y.organization_id = p_org and y.period_id = p_period.id and y.person_id = p_person order by y.paid_at desc limit 1;
  select count(*), coalesce(sum(c.amount_minor), 0) into v_cc, v_c
    from public.purchase_contributions c join public.purchases pu on pu.id = c.purchase_id
   where c.organization_id = p_org and c.person_id = p_person
     and (pu.occurred_at at time zone v_tz)::date between p_period.starts_on and p_period.ends_on;

  -- Rule in force for the period (assumption pending 07 I6: the version in force at the period's end applies).
  select * into v_rule from public.rule_versions rv
   where rv.organization_id = p_org and rv.person_id = p_person and rv.effective_from <= p_period.ends_on
   order by rv.effective_from desc limit 1;
  if v_rule.id is null then
    v_kind := 'none';
  elsif v_rule.kind = 'standing' then
    v_kind := 'standing'; v_pct := v_rule.percent; v_decided := true; v_set_at := v_rule.set_at; v_set_by := v_rule.set_by_person_id;
  else
    v_kind := 'contextual'; v_set_at := v_rule.set_at; v_set_by := v_rule.set_by_person_id;
    select * into v_dec from public.period_rule_decisions d
     where d.period_id = p_period.id and d.person_id = p_person order by d.seq desc limit 1;
    if v_dec.id is not null then
      v_pct := v_dec.percent; v_decided := true; v_set_at := v_dec.decided_at; v_set_by := v_dec.decided_by_person_id;
    end if;
    if p_override is not null then v_pct := p_override; end if;      -- read-only preview ("Se confirmar X%")
  end if;
  if v_pct is not null then v_e := round(v_p * v_pct / 100); end if;

  return jsonb_build_object(
    'person_id', p_person,
    'display_name', (select display_name from public.people where id = p_person),
    'is_owner', exists (select 1 from public.person_ownerships o where o.person_id = p_person),
    'capabilities', (select coalesce(jsonb_agg(c.label order by c.sort_order, c.label), '[]'::jsonb) from public.person_capabilities c where c.person_id = p_person),
    'production', jsonb_build_object('count', v_pc, 'total_minor', v_p),
    'rule', jsonb_build_object('kind', v_kind, 'percent', v_pct, 'salon_percent', 100 - v_pct, 'decided', v_decided,
                               'set_at', v_set_at, 'set_by', (select display_name from public.people where id = v_set_by)),
    'earned_minor', v_e,
    'advances', jsonb_build_object('count', v_ac, 'total_minor', v_a),
    'payments', jsonb_build_object('count', v_yc, 'total_minor', v_y, 'last', v_last),
    'contributions', jsonb_build_object('count', v_cc, 'total_minor', v_c),
    -- GREATEST/LEAST ignore NULLs: guard explicitly so a pending rule stays undefined, never 0
    'difference_minor', v_e - v_a - v_y,
    'remaining_minor', case when v_e is not null then greatest(v_e - v_a - v_y, 0) end,
    'excess_minor', case when v_e is not null then greatest(v_a + v_y - v_e, 0) end,
    'delivered_to_earned_minor', case when v_e is not null then least(v_a + v_y, v_e) end);
end $$;

-- People counted in a period: a rule in force for it, or any record in it.
create or replace function private.period_people(p_org uuid, p_period public.periods)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select p.id from public.people p join public.organizations o on o.id = p.organization_id
   where p.organization_id = p_org and (
     exists (select 1 from public.rule_versions rv where rv.person_id = p.id and rv.effective_from <= p_period.ends_on)
     or exists (select 1 from public.service_records r where r.person_id = p.id
                 and (r.occurred_at at time zone o.timezone)::date between p_period.starts_on and p_period.ends_on)
     or exists (select 1 from public.advances a where a.person_id = p.id
                 and (a.occurred_at at time zone o.timezone)::date between p_period.starts_on and p_period.ends_on)
     or exists (select 1 from public.payments y where y.person_id = p.id and y.period_id = p_period.id))
   order by p.display_name
$$;

-- Period position (Slice 06 §7 with D1 and D6):
--   Livre = produção − ganhos da equipa − despesas − compras (salão) − reserva alocada + pago pela reserva − acima do ganho
--   "—" (null) while any rule is pending; the same expression over defined people is "Sobra · antes das regras por definir".
--   Não distribuído = livre − distribuição;  A pagar à equipa = Σ remaining payable.
create or replace function private.period_position(p_org uuid, p_period public.periods, p_override_person uuid default null, p_override_percent numeric default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text; v_people jsonb; v_pending jsonb; v_prod bigint; v_prod_count int; v_earned bigint; v_excess bigint; v_payable bigint;
  v_delivered bigint; v_adv bigint; v_paid bigint; v_exp_count int; v_exp bigint; v_pur_count int; v_pur bigint; v_contrib bigint;
  v_alloc bigint; v_used bigint; v_sobra bigint; v_livre bigint; v_dec public.owners_decisions; v_dist bigint;
begin
  select o.timezone into v_tz from public.organizations o where o.id = p_org;
  select coalesce(jsonb_agg(private.person_period_figures(p_org, p_period, pid, case when pid = p_override_person then p_override_percent end)), '[]'::jsonb)
    into v_people from private.period_people(p_org, p_period) pid;

  select coalesce(jsonb_agg(jsonb_build_object('person_id', x ->> 'person_id', 'display_name', x ->> 'display_name')), '[]'::jsonb)
    into v_pending from jsonb_array_elements(v_people) x where x ->> 'earned_minor' is null;
  select coalesce(sum((x -> 'production' ->> 'total_minor')::bigint), 0), coalesce(sum((x -> 'production' ->> 'count')::int), 0),
         coalesce(sum((x ->> 'earned_minor')::bigint), 0), coalesce(sum((x ->> 'excess_minor')::bigint), 0),
         coalesce(sum((x ->> 'remaining_minor')::bigint), 0), coalesce(sum((x ->> 'delivered_to_earned_minor')::bigint), 0),
         coalesce(sum((x -> 'advances' ->> 'total_minor')::bigint), 0), coalesce(sum((x -> 'payments' ->> 'total_minor')::bigint), 0)
    into v_prod, v_prod_count, v_earned, v_excess, v_payable, v_delivered, v_adv, v_paid from jsonb_array_elements(v_people) x;

  select count(*), coalesce(sum(e.amount_minor), 0) into v_exp_count, v_exp from public.expenses e
   where e.organization_id = p_org and (e.occurred_at at time zone v_tz)::date between p_period.starts_on and p_period.ends_on;
  select count(*), coalesce(sum(pu.total_minor), 0) into v_pur_count, v_pur from public.purchases pu
   where pu.organization_id = p_org and (pu.occurred_at at time zone v_tz)::date between p_period.starts_on and p_period.ends_on;
  select coalesce(sum(c.amount_minor), 0) into v_contrib
    from public.purchase_contributions c join public.purchases pu on pu.id = c.purchase_id
   where c.organization_id = p_org and c.contributor_kind = 'person'
     and (pu.occurred_at at time zone v_tz)::date between p_period.starts_on and p_period.ends_on;
  select coalesce(sum(amount_minor), 0) into v_alloc from public.reserve_allocations where period_id = p_period.id;
  select coalesce(sum(amount_minor), 0) into v_used from public.reserve_uses where period_id = p_period.id;

  v_sobra := v_prod - v_earned - v_exp - (v_pur - v_contrib) - v_alloc + v_used - v_excess;
  if jsonb_array_length(v_pending) = 0 then v_livre := v_sobra; end if;

  select * into v_dec from public.owners_decisions d where d.period_id = p_period.id order by d.seq desc limit 1;
  if v_dec.id is not null then v_dist := case when v_dec.kind = 'amount' then v_dec.amount_minor else 0 end; end if;

  return jsonb_build_object(
    'people', v_people, 'pending', v_pending,
    'production', jsonb_build_object('count', v_prod_count, 'total_minor', v_prod),
    'team_earned_minor', v_earned, 'excess_minor', v_excess, 'payable_minor', v_payable,
    'delivered_to_earned_minor', v_delivered, 'advances_minor', v_adv, 'payments_minor', v_paid,
    'expenses', jsonb_build_object('count', v_exp_count, 'total_minor', v_exp),
    'purchases', jsonb_build_object('count', v_pur_count, 'total_minor', v_pur, 'contributions_minor', v_contrib, 'salon_minor', v_pur - v_contrib),
    'reserve_allocated_minor', v_alloc, 'reserve_used_minor', v_used,
    'sobra_minor', v_sobra, 'livre_minor', v_livre,
    'owners_decision', case when v_dec.id is null then null else jsonb_build_object(
        'kind', v_dec.kind, 'amount_minor', v_dec.amount_minor, 'decided_at', v_dec.decided_at,
        'decided_by', (select display_name from public.people where id = v_dec.decided_by_person_id)) end,
    'distribution_minor', v_dist,
    'undistributed_minor', case when v_livre is not null and v_dist is not null then v_livre - v_dist end);
end $$;

create or replace function private.reserve_balance(p_org uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select (select coalesce(sum(amount_minor), 0) from public.reserve_allocations where organization_id = p_org)
       - (select coalesce(sum(amount_minor), 0) from public.reserve_uses where organization_id = p_org)
$$;

create or replace function private.current_approval(p_period_id uuid)
returns public.period_approvals language sql stable security definer set search_path = '' as $$
  select a.* from public.period_approvals a
   where a.period_id = p_period_id and not exists (select 1 from public.period_approval_annulments n where n.approval_id = a.id)
   order by a.seq desc limit 1
$$;

-- Approved lines with what has been paid against them.
create or replace function private.approval_payments(p_approval public.period_approvals)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'person_id', l.person_id, 'display_name', l.display_name, 'rule_kind', l.rule_kind, 'percent', l.percent,
      'earned_minor', l.earned_minor, 'advances_minor', l.advances_minor, 'excess_minor', l.excess_minor,
      'approved_minor', l.approved_minor, 'paid_minor', paid.total, 'outstanding_minor', greatest(l.approved_minor - paid.total, 0),
      'status', case when l.approved_minor = 0 then 'nada_a_pagar' when paid.total = 0 then 'por_pagar'
                     when paid.total < l.approved_minor then 'parcial' else 'pago' end,
      'last', paid.last) order by l.display_name), '[]'::jsonb)
  from public.period_approval_lines l
  cross join lateral (
    select coalesce(sum(y.amount_minor), 0) as total,
           (select jsonb_build_object('amount_minor', y2.amount_minor, 'paid_at', y2.paid_at, 'method_label', m.label, 'confirmed_by', cb.display_name)
              from public.payments y2 join public.payment_methods m on m.id = y2.payment_method_id join public.people cb on cb.id = y2.confirmed_by_person_id
             where y2.approval_id = l.approval_id and y2.person_id = l.person_id order by y2.paid_at desc limit 1) as last
      from public.payments y where y.approval_id = l.approval_id and y.person_id = l.person_id) paid
  where l.approval_id = p_approval.id
$$;

revoke all on function private.person_period_figures(uuid, public.periods, uuid, numeric), private.period_people(uuid, public.periods),
  private.period_position(uuid, public.periods, uuid, numeric), private.reserve_balance(uuid), private.current_approval(uuid),
  private.approval_payments(public.period_approvals), private.calculation_version() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Slice 04 situation now uses the shared calculation (contextual decisions included). Output shape unchanged.
create or replace function public.team_situation(p_person_id uuid, p_period_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_view text := private.situation_view(p_person_id);
  v_org uuid := private.current_org_id();
  v_period public.periods := private.resolve_period(p_period_id);
  v_f jsonb := private.person_period_figures(v_org, v_period, p_person_id);
  v_rule jsonb := v_f -> 'rule';
begin
  return jsonb_build_object(
    'view', v_view,
    'person', jsonb_build_object('id', p_person_id, 'display_name', v_f ->> 'display_name', 'capabilities', v_f -> 'capabilities'),
    'period', jsonb_build_object('id', v_period.id, 'label', v_period.label, 'state', v_period.state,
                                 'starts_on', v_period.starts_on, 'ends_on', v_period.ends_on),
    'production', v_f -> 'production',
    'rule', case when v_rule ->> 'kind' = 'none' then jsonb_build_object('kind', 'none')
                 else jsonb_build_object('kind', v_rule ->> 'kind', 'percent', (v_rule ->> 'percent')::numeric,
                        'salon_percent', (v_rule ->> 'salon_percent')::numeric, 'set_at', v_rule -> 'set_at',
                        'set_by', case when v_view = 'manager' then v_rule ->> 'set_by' end) end,
    'earned_minor', v_f -> 'earned_minor',
    'advances', v_f -> 'advances',
    'payments', jsonb_build_object('count', v_f -> 'payments' -> 'count', 'total_minor', v_f -> 'payments' -> 'total_minor',
                  'last', case when v_f -> 'payments' -> 'last' = 'null'::jsonb or v_f -> 'payments' -> 'last' is null then null
                               else (v_f -> 'payments' -> 'last') || jsonb_build_object('confirmed_by',
                                      case when v_view = 'manager' then v_f -> 'payments' -> 'last' ->> 'confirmed_by' end) end),
    'difference_minor', v_f -> 'difference_minor',
    'remaining_minor', v_f -> 'remaining_minor',
    'excess_minor', v_f -> 'excess_minor',
    'contributions', v_f -> 'contributions');
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Reads (B4 private context: a verified person holding team.finance.read)
create or replace function private.require_finance_viewer()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_viewer uuid := private.current_private_person();
begin
  if private.current_org_id() is null then raise exception 'NOT_AUTHORIZED'; end if;
  if v_viewer is null then raise exception 'VERIFICATION_REQUIRED'; end if;
  if not private.has_permission(v_viewer, 'team.finance.read') then raise exception 'NOT_AUTHORIZED'; end if;
  return v_viewer;
end $$;
revoke all on function private.require_finance_viewer() from public, anon, authenticated;

create or replace function public.fecho_periods()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id();
begin
  perform private.require_finance_viewer();
  return coalesce((select jsonb_agg(jsonb_build_object('id', pe.id, 'label', pe.label, 'state', pe.state, 'starts_on', pe.starts_on,
                    'ends_on', pe.ends_on) order by pe.starts_on desc) from public.periods pe where pe.organization_id = v_org), '[]'::jsonb);
end $$;

-- The Fecho review: figures and revision from one snapshot (R-2: a STABLE function sees the calling statement's
-- snapshot). A closed period displays its latest close statement (ADR-0007).
create or replace function public.fecho_period(p_period_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := private.current_org_id(); v_viewer uuid := private.require_finance_viewer();
  v_period public.periods := private.resolve_period(p_period_id); v_tz text;
  v_pos jsonb; v_stmt public.period_close_statements; v_appr public.period_approvals; v_lines jsonb := '[]'::jsonb;
  v_exceptions jsonb := '[]'::jsonb; v_unpaid bigint := 0; v_x jsonb; v_today date;
begin
  select o.timezone into v_tz from public.organizations o where o.id = v_org;
  v_today := (now() at time zone v_tz)::date;
  select * into v_stmt from public.period_close_statements s where s.period_id = v_period.id order by s.seq desc limit 1;
  if v_period.state = 'fechado' and v_stmt.id is not null then v_pos := v_stmt.statement -> 'position';
  else v_pos := private.period_position(v_org, v_period); end if;

  v_appr := private.current_approval(v_period.id);
  if v_appr.id is not null then
    v_lines := private.approval_payments(v_appr);
    select coalesce(sum((l ->> 'outstanding_minor')::bigint), 0) into v_unpaid from jsonb_array_elements(v_lines) l;
  end if;

  -- Exceptions (Slice 06 §5): blocking first, then review, then payments.
  if v_period.state <> 'fechado' then
    for v_x in select x from jsonb_array_elements(v_pos -> 'people') x where x ->> 'earned_minor' is null loop
      v_exceptions := v_exceptions || jsonb_build_object('kind', 'rule_pending', 'blocking', true, 'person', v_x);
    end loop;
    if v_period.state = 'aberto' then
      for v_x in select x from jsonb_array_elements(v_pos -> 'people') x where (x ->> 'excess_minor')::bigint > 0 loop
        v_exceptions := v_exceptions || jsonb_build_object('kind', 'above_earned', 'blocking', false, 'person', v_x);
      end loop;
    end if;
    if jsonb_array_length(v_pos -> 'pending') = 0 and v_pos -> 'owners_decision' = 'null'::jsonb then
      v_exceptions := v_exceptions || jsonb_build_object('kind', 'distribution_undecided', 'blocking', false);
    end if;
    if (v_pos ->> 'livre_minor') is not null and (v_pos ->> 'distribution_minor') is not null
       and (v_pos ->> 'distribution_minor')::bigint > (v_pos ->> 'livre_minor')::bigint then
      v_exceptions := v_exceptions || jsonb_build_object('kind', 'distribution_above_free', 'blocking', false);
    end if;
    for v_x in select l from jsonb_array_elements(v_lines) l where (l ->> 'outstanding_minor')::bigint > 0 loop
      v_exceptions := v_exceptions || jsonb_build_object('kind', 'payment_pending', 'blocking', false, 'line', v_x);
    end loop;
  end if;

  return jsonb_build_object(
    'period', jsonb_build_object('id', v_period.id, 'label', v_period.label, 'state', v_period.state, 'starts_on', v_period.starts_on,
                                 'ends_on', v_period.ends_on, 'is_current', v_today between v_period.starts_on and v_period.ends_on),
    'review_revision', v_period.review_revision,
    'calculation_version', private.calculation_version(),
    'source', case when v_period.state = 'fechado' and v_stmt.id is not null then 'close_statement' else 'live' end,
    'position', v_pos,
    'approval', case when v_appr.id is null then null else jsonb_build_object(
        'id', v_appr.id, 'approved_at', v_appr.approved_at, 'approved_by', (select display_name from public.people where id = v_appr.approved_by_person_id),
        'review_revision', v_appr.review_revision, 'total_minor', (v_appr.totals ->> 'payable_minor')::bigint, 'cases', v_appr.cases,
        'lines', v_lines, 'paid_minor', (select coalesce(sum((l ->> 'paid_minor')::bigint), 0) from jsonb_array_elements(v_lines) l),
        'outstanding_minor', v_unpaid,
        'payments_count', (select count(*) from public.payments y where y.approval_id = v_appr.id)) end,
    'exceptions', v_exceptions,
    'readiness', jsonb_build_object(
        'can_approve', v_period.state = 'aberto' and jsonb_array_length(v_pos -> 'pending') = 0,
        'can_annul', v_period.state = 'pronto_para_pagamento' and v_appr.id is not null
                     and not exists (select 1 from public.payments y where y.approval_id = v_appr.id),
        'can_pay', v_period.state in ('pronto_para_pagamento', 'em_pagamento') and v_appr.id is not null and v_unpaid > 0,
        'can_close', v_period.state in ('pronto_para_pagamento', 'em_pagamento') and v_appr.id is not null and v_unpaid = 0,
        'unpaid_minor', v_unpaid),
    'closed', case when v_stmt.id is null or v_period.state <> 'fechado' then null else jsonb_build_object(
        'closed_at', v_stmt.closed_at, 'closed_by', (select display_name from public.people where id = v_stmt.closed_by_person_id),
        'calculation_version', v_stmt.calculation_version, 'review_revision', v_stmt.review_revision) end);
end $$;

-- Dinheiro do período (F6 + D1 reserve card): the records behind the money rows.
create or replace function public.fecho_money(p_period_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_viewer uuid := private.require_finance_viewer();
  v_period public.periods := private.resolve_period(p_period_id); v_tz text;
begin
  select o.timezone into v_tz from public.organizations o where o.id = v_org;
  return jsonb_build_object(
    'expenses', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'occurred_at', e.occurred_at, 'category', c.label, 'note', e.note,
        'method', case when e.payment_kind = 'mixed' then 'Misto' else (select m.label from public.expense_payments ep join public.payment_methods m on m.id = ep.payment_method_id where ep.expense_id = e.id limit 1) end,
        'amount_minor', e.amount_minor,
        'reserve_used_minor', (select coalesce(sum(u.amount_minor), 0) from public.reserve_uses u where u.expense_id = e.id)) order by e.occurred_at)
      from public.expenses e join public.expense_categories c on c.id = e.category_id
     where e.organization_id = v_org and (e.occurred_at at time zone v_tz)::date between v_period.starts_on and v_period.ends_on), '[]'::jsonb),
    'purchases', coalesce((select jsonb_agg(jsonb_build_object('id', pu.id, 'occurred_at', pu.occurred_at,
        'origin', (select o.label from public.purchase_origins o where o.id = pu.origin_id),
        'line_count', (select count(*) from public.purchase_lines l where l.purchase_id = pu.id),
        'total_minor', pu.total_minor,
        'salon_minor', pu.total_minor - (select coalesce(sum(c.amount_minor), 0) from public.purchase_contributions c where c.purchase_id = pu.id and c.contributor_kind = 'person'),
        'contributors', (select coalesce(jsonb_agg(jsonb_build_object('name', p.display_name, 'amount_minor', c.amount_minor) order by p.display_name), '[]'::jsonb)
                           from public.purchase_contributions c join public.people p on p.id = c.person_id where c.purchase_id = pu.id),
        'reserve_used_minor', (select coalesce(sum(u.amount_minor), 0) from public.reserve_uses u where u.purchase_id = pu.id)) order by pu.occurred_at)
      from public.purchases pu
     where pu.organization_id = v_org and (pu.occurred_at at time zone v_tz)::date between v_period.starts_on and v_period.ends_on), '[]'::jsonb),
    'reserve', jsonb_build_object(
      'allocated_minor', (select coalesce(sum(amount_minor), 0) from public.reserve_allocations where period_id = v_period.id),
      'used_minor', (select coalesce(sum(amount_minor), 0) from public.reserve_uses where period_id = v_period.id),
      'balance_minor', private.reserve_balance(v_org),
      'movements', coalesce((select jsonb_agg(m order by m ->> 'occurred_at' desc) from (
          select jsonb_build_object('kind', 'allocation', 'occurred_at', a.occurred_at, 'amount_minor', a.amount_minor, 'note', a.note,
                                    'confirmed_by', p.display_name) m
            from public.reserve_allocations a join public.people p on p.id = a.confirmed_by_person_id where a.period_id = v_period.id
          union all
          select jsonb_build_object('kind', 'use', 'occurred_at', u.occurred_at, 'amount_minor', u.amount_minor,
                   'target', coalesce((select c.label from public.expenses e join public.expense_categories c on c.id = e.category_id where e.id = u.expense_id),
                                      (select 'Compra' || coalesce(' · ' || o.label, '') from public.purchases pu left join public.purchase_origins o on o.id = pu.origin_id where pu.id = u.purchase_id)),
                   'confirmed_by', p.display_name)
            from public.reserve_uses u join public.people p on p.id = u.confirmed_by_person_id where u.period_id = v_period.id) x), '[]'::jsonb)));
end $$;

-- "Se confirmar X%" (F5/F9): the same calculation with a hypothetical rule, read-only (ADR-0004).
create or replace function public.fecho_rule_preview(p_period_id uuid, p_person_id uuid, p_percent numeric)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_viewer uuid := private.require_finance_viewer();
  v_period public.periods := private.resolve_period(p_period_id); v_now jsonb; v_after jsonb; v_person jsonb; v_current jsonb;
begin
  if p_percent is not null and (p_percent < 0 or p_percent > 100) then raise exception 'VALIDATION_FAILED'; end if;
  if not exists (select 1 from public.people where id = p_person_id and organization_id = v_org) then raise exception 'CROSS_TENANT_REFERENCE'; end if;
  v_current := private.person_period_figures(v_org, v_period, p_person_id);
  v_now := private.period_position(v_org, v_period);
  v_after := private.period_position(v_org, v_period, p_person_id, p_percent);
  select x into v_person from jsonb_array_elements(v_after -> 'people') x where x ->> 'person_id' = p_person_id::text;
  return jsonb_build_object(
    'person', coalesce(v_person, v_current), 'current', v_current,
    -- base = the period figure without this person's earned value and excess (it is subtracted again below)
    'base_minor', (v_after ->> 'sobra_minor')::bigint + coalesce((v_person ->> 'earned_minor')::bigint, 0) + coalesce((v_person ->> 'excess_minor')::bigint, 0),
    'after', jsonb_build_object('sobra_minor', v_after -> 'sobra_minor', 'livre_minor', v_after -> 'livre_minor',
                                'pending', v_after -> 'pending', 'distribution_minor', v_after -> 'distribution_minor',
                                'undistributed_minor', v_after -> 'undistributed_minor', 'owners_decision', v_after -> 'owners_decision'),
    'history', coalesce((select jsonb_agg(jsonb_build_object('percent', d.percent, 'period_label', pe.label, 'starts_on', pe.starts_on) order by pe.starts_on desc)
                           from (select distinct on (period_id) * from public.period_rule_decisions where person_id = p_person_id and period_id <> v_period.id
                                 order by period_id, seq desc) d join public.periods pe on pe.id = d.period_id), '[]'::jsonb));
end $$;

-- Decisões e histórico (F15): the close's own decisions only, newest first, with who and when.
create or replace function public.fecho_history(p_period_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_viewer uuid := private.require_finance_viewer();
  v_period public.periods := private.resolve_period(p_period_id);
begin
  return coalesce((select jsonb_agg(h order by h ->> 'at' desc) from (
    select jsonb_build_object('kind', 'rule', 'at', d.decided_at, 'person', p.display_name, 'percent', d.percent, 'previous_percent', d.previous_percent, 'by', b.display_name) h
      from public.period_rule_decisions d join public.people p on p.id = d.person_id join public.people b on b.id = d.decided_by_person_id where d.period_id = v_period.id
    union all
    select jsonb_build_object('kind', 'owners_decision', 'at', d.decided_at, 'decision', d.kind, 'amount_minor', d.amount_minor, 'by', b.display_name)
      from public.owners_decisions d join public.people b on b.id = d.decided_by_person_id where d.period_id = v_period.id
    union all
    select jsonb_build_object('kind', 'reserve_allocation', 'at', a.occurred_at, 'amount_minor', a.amount_minor, 'note', a.note, 'by', b.display_name)
      from public.reserve_allocations a join public.people b on b.id = a.confirmed_by_person_id where a.period_id = v_period.id
    union all
    select jsonb_build_object('kind', 'reserve_use', 'at', u.occurred_at, 'amount_minor', u.amount_minor, 'by', b.display_name)
      from public.reserve_uses u join public.people b on b.id = u.confirmed_by_person_id where u.period_id = v_period.id
    union all
    select jsonb_build_object('kind', 'approval', 'at', a.approved_at, 'total_minor', (a.totals ->> 'payable_minor')::bigint,
             'people', (select count(*) from public.period_approval_lines l where l.approval_id = a.id and l.approved_minor > 0),
             'cases', a.cases, 'by', b.display_name)
      from public.period_approvals a join public.people b on b.id = a.approved_by_person_id where a.period_id = v_period.id
    union all
    select jsonb_build_object('kind', 'annulment', 'at', n.annulled_at, 'by', b.display_name)
      from public.period_approval_annulments n join public.period_approvals a on a.id = n.approval_id join public.people b on b.id = n.annulled_by_person_id
     where a.period_id = v_period.id
    union all
    select jsonb_build_object('kind', 'payment', 'at', y.paid_at, 'person', p.display_name, 'amount_minor', y.amount_minor, 'method', m.label, 'by', b.display_name)
      from public.payments y join public.people p on p.id = y.person_id join public.people b on b.id = y.confirmed_by_person_id
      join public.payment_methods m on m.id = y.payment_method_id where y.period_id = v_period.id
    union all
    select jsonb_build_object('kind', 'close', 'at', s.closed_at, 'by', b.display_name,
             'paid_minor', (s.statement -> 'approval' ->> 'paid_minor')::bigint, 'payments_count', (s.statement -> 'approval' ->> 'payments_count')::int,
             'distribution_minor', s.statement -> 'position' -> 'distribution_minor')
      from public.period_close_statements s join public.people b on b.id = s.closed_by_person_id where s.period_id = v_period.id
  ) x), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Command helpers (ADR-0006; same contract as Slices 01–03)
create or replace function private.cmd_replay(p_command_id uuid, p_type text, p_fp text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_j private.command_journal;
begin
  perform pg_advisory_xact_lock(hashtextextended('cmd:' || p_command_id::text, 0));
  select * into v_j from private.command_journal where command_id = p_command_id;
  if not found then return null; end if;
  if v_j.organization_id = private.current_org_id() and v_j.principal = auth.uid() and v_j.command_type = p_type and v_j.fingerprint = p_fp then
    return v_j.result || jsonb_build_object('replayed', true);
  end if;
  raise exception 'IDEMPOTENCY_CONFLICT';
end $$;

create or replace function private.cmd_done(p_command_id uuid, p_type text, p_fp text, p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  insert into private.command_journal (command_id, organization_id, principal, command_type, fingerprint, result)
  values (p_command_id, private.current_org_id(), auth.uid(), p_type, p_fp, p_result);
  return p_result;
end $$;

create or replace function private.lock_period(p_org uuid, p_period_id uuid)
returns public.periods language plpgsql security definer set search_path = '' as $$
declare v_p public.periods;
begin
  select * into v_p from public.periods where id = p_period_id and organization_id = p_org for update;
  if v_p.id is null then raise exception 'CROSS_TENANT_REFERENCE'; end if;
  return v_p;
end $$;

create or replace function private.set_period_state(p_period public.periods, p_to text, p_actor uuid, p_command uuid, p_reason text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_rev bigint;
begin
  update public.periods set state = p_to, review_revision = review_revision + 1 where id = p_period.id returning review_revision into v_rev;
  insert into public.period_transitions (organization_id, period_id, from_state, to_state, actor_person_id, reason, review_revision, command_id)
  values (p_period.organization_id, p_period.id, p_period.state, p_to, p_actor, p_reason, v_rev, p_command);
  return v_rev;
end $$;

revoke all on function private.cmd_replay(uuid, text, text), private.cmd_done(uuid, text, text, jsonb), private.lock_period(uuid, uuid),
  private.set_period_state(public.periods, text, uuid, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Commands. Each: replay first (ADR-0006), then the exact one-shot grant of a person holding the boundary's
-- permission (ADR-0009; B5 period.decide · B6 payment.confirm · B7 period.close), then the period lock (R-4).

-- Regra do período: set or change a contextual rule while the period is Aberto (Slice 06 §6; after approval only by
-- annulling the approval).
create or replace function public.decide_period_rule(p_command_id uuid, p_grant_id uuid, p_period_id uuid, p_person_id uuid, p_percent numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_fp text; v_r jsonb; v_actor uuid; v_p public.periods; v_kind text; v_prev numeric; v_id uuid; v_rev bigint;
begin
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or p_period_id is null or p_person_id is null or p_percent is null then raise exception 'VALIDATION_FAILED'; end if;
  v_fp := md5(jsonb_build_object('period', p_period_id, 'person', p_person_id, 'percent', p_percent)::text);
  v_r := private.cmd_replay(p_command_id, 'decide_period_rule', v_fp); if v_r is not null then return v_r; end if;
  v_actor := private.consume_one_shot_grant(p_grant_id, 'period.decide', p_command_id);
  v_p := private.lock_period(v_org, p_period_id);
  if v_p.state = 'fechado' then raise exception 'PERIOD_CLOSED'; end if;
  if v_p.state <> 'aberto' then raise exception 'PERIOD_STATE_INVALID'; end if;
  if not exists (select 1 from public.people where id = p_person_id and organization_id = v_org) then raise exception 'CROSS_TENANT_REFERENCE'; end if;
  select rv.kind into v_kind from public.rule_versions rv where rv.person_id = p_person_id and rv.effective_from <= v_p.ends_on order by rv.effective_from desc limit 1;
  if v_kind is distinct from 'contextual' or p_percent < 0 or p_percent > 100 or round(p_percent, 2) <> p_percent then raise exception 'VALIDATION_FAILED'; end if;
  select d.percent into v_prev from public.period_rule_decisions d where d.period_id = p_period_id and d.person_id = p_person_id order by d.seq desc limit 1;
  insert into public.period_rule_decisions (organization_id, period_id, person_id, percent, previous_percent, decided_by_person_id, command_id)
  values (v_org, p_period_id, p_person_id, p_percent, v_prev, v_actor, p_command_id) returning id into v_id;
  v_rev := private.touch_period(p_period_id);
  return private.cmd_done(p_command_id, 'decide_period_rule', v_fp, jsonb_build_object('decision_id', v_id, 'percent', p_percent,
           'previous_percent', v_prev, 'decided_by_person_id', v_actor, 'review_revision', v_rev));
end $$;

-- Decisão dos sócios (D3): Sem distribuição or an amount; changeable until the period is closed.
create or replace function public.record_owners_decision(p_command_id uuid, p_grant_id uuid, p_period_id uuid, p_kind text, p_amount_minor bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_fp text; v_r jsonb; v_actor uuid; v_p public.periods; v_id uuid; v_rev bigint;
begin
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or p_period_id is null or p_kind not in ('none', 'amount')
     or (p_kind = 'none' and p_amount_minor is not null) or (p_kind = 'amount' and coalesce(p_amount_minor, 0) <= 0) then
    raise exception 'VALIDATION_FAILED';
  end if;
  v_fp := md5(jsonb_build_object('period', p_period_id, 'kind', p_kind, 'amount', p_amount_minor)::text);
  v_r := private.cmd_replay(p_command_id, 'record_owners_decision', v_fp); if v_r is not null then return v_r; end if;
  v_actor := private.consume_one_shot_grant(p_grant_id, 'period.decide', p_command_id);
  v_p := private.lock_period(v_org, p_period_id);
  if v_p.state = 'fechado' then raise exception 'PERIOD_CLOSED'; end if;
  insert into public.owners_decisions (organization_id, period_id, kind, amount_minor, decided_by_person_id, command_id)
  values (v_org, p_period_id, p_kind, p_amount_minor, v_actor, p_command_id) returning id into v_id;
  v_rev := private.touch_period(p_period_id);
  return private.cmd_done(p_command_id, 'record_owners_decision', v_fp, jsonb_build_object('decision_id', v_id, 'kind', p_kind,
           'amount_minor', p_amount_minor, 'decided_by_person_id', v_actor, 'review_revision', v_rev));
end $$;

-- Alocar à reserva (D1): business money earmarked; not an expense. Not in a closed period.
create or replace function public.allocate_reserve(p_command_id uuid, p_grant_id uuid, p_period_id uuid, p_amount_minor bigint, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_note text := nullif(trim(coalesce(p_note, '')), ''); v_fp text; v_r jsonb; v_actor uuid;
  v_p public.periods; v_id uuid; v_rev bigint;
begin
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or p_period_id is null or coalesce(p_amount_minor, 0) <= 0 or char_length(coalesce(v_note, '')) > 60 then raise exception 'VALIDATION_FAILED'; end if;
  v_fp := md5(jsonb_build_object('period', p_period_id, 'amount', p_amount_minor, 'note', v_note)::text);
  v_r := private.cmd_replay(p_command_id, 'allocate_reserve', v_fp); if v_r is not null then return v_r; end if;
  v_actor := private.consume_one_shot_grant(p_grant_id, 'period.decide', p_command_id);
  v_p := private.lock_period(v_org, p_period_id);
  if v_p.state = 'fechado' then raise exception 'PERIOD_CLOSED'; end if;
  perform 1 from public.organizations where id = v_org for update;              -- the organization's reserve
  insert into public.reserve_allocations (organization_id, period_id, amount_minor, note, confirmed_by_person_id, command_id)
  values (v_org, p_period_id, p_amount_minor, v_note, v_actor, p_command_id) returning id into v_id;
  v_rev := private.touch_period(p_period_id);
  return private.cmd_done(p_command_id, 'allocate_reserve', v_fp, jsonb_build_object('allocation_id', v_id, 'amount_minor', p_amount_minor,
           'balance_minor', private.reserve_balance(v_org), 'confirmed_by_person_id', v_actor, 'review_revision', v_rev));
end $$;

-- Usar a reserva (D1): an expense or the salon part of a purchase paid with money set aside earlier. Never above the
-- reserve balance, nor above what remains of that record's amount (salon part only — contributors' money is theirs).
create or replace function public.use_reserve(p_command_id uuid, p_grant_id uuid, p_expense_id uuid, p_purchase_id uuid, p_amount_minor bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_fp text; v_r jsonb; v_actor uuid; v_at timestamptz; v_eligible bigint; v_period uuid;
  v_p public.periods; v_balance bigint; v_id uuid; v_rev bigint;
begin
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or ((p_expense_id is null) = (p_purchase_id is null)) or coalesce(p_amount_minor, 0) <= 0 then raise exception 'VALIDATION_FAILED'; end if;
  v_fp := md5(jsonb_build_object('expense', p_expense_id, 'purchase', p_purchase_id, 'amount', p_amount_minor)::text);
  v_r := private.cmd_replay(p_command_id, 'use_reserve', v_fp); if v_r is not null then return v_r; end if;
  v_actor := private.consume_one_shot_grant(p_grant_id, 'period.decide', p_command_id);
  if p_expense_id is not null then
    select e.occurred_at, e.amount_minor into v_at, v_eligible from public.expenses e where e.id = p_expense_id and e.organization_id = v_org;
  else
    select pu.occurred_at, pu.total_minor - (select coalesce(sum(c.amount_minor), 0) from public.purchase_contributions c where c.purchase_id = pu.id and c.contributor_kind = 'person')
      into v_at, v_eligible from public.purchases pu where pu.id = p_purchase_id and pu.organization_id = v_org;
  end if;
  if v_at is null then raise exception 'CROSS_TENANT_REFERENCE'; end if;
  v_period := private.period_for(v_org, v_at);
  if v_period is null then raise exception 'VALIDATION_FAILED'; end if;
  v_p := private.lock_period(v_org, v_period);
  if v_p.state = 'fechado' then raise exception 'PERIOD_CLOSED'; end if;
  perform 1 from public.organizations where id = v_org for update;              -- serialize reserve uses
  v_balance := private.reserve_balance(v_org);
  if p_amount_minor > v_balance then raise exception 'RESERVE_INSUFFICIENT'; end if;
  v_eligible := v_eligible - (select coalesce(sum(u.amount_minor), 0) from public.reserve_uses u where u.expense_id = p_expense_id or u.purchase_id = p_purchase_id);
  if p_amount_minor > v_eligible then raise exception 'RESERVE_EXCEEDS_RECORD'; end if;
  insert into public.reserve_uses (organization_id, period_id, expense_id, purchase_id, amount_minor, confirmed_by_person_id, command_id)
  values (v_org, v_period, p_expense_id, p_purchase_id, p_amount_minor, v_actor, p_command_id) returning id into v_id;
  v_rev := private.touch_period(v_period);
  return private.cmd_done(p_command_id, 'use_reserve', v_fp, jsonb_build_object('use_id', v_id, 'amount_minor', p_amount_minor,
           'balance_minor', v_balance - p_amount_minor, 'confirmed_by_person_id', v_actor, 'review_revision', v_rev));
end $$;

-- Aprovar valores a pagar: the reviewed revision, every rule defined, immutable outputs (ADR-0005 R-3, ADR-0007).
create or replace function public.approve_period(p_command_id uuid, p_grant_id uuid, p_period_id uuid, p_review_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_fp text; v_r jsonb; v_actor uuid; v_p public.periods; v_pos jsonb; v_cases jsonb; v_id uuid; v_rev bigint;
begin
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or p_period_id is null or p_review_revision is null then raise exception 'VALIDATION_FAILED'; end if;
  v_fp := md5(jsonb_build_object('period', p_period_id, 'revision', p_review_revision)::text);
  v_r := private.cmd_replay(p_command_id, 'approve_period', v_fp); if v_r is not null then return v_r; end if;
  v_actor := private.consume_one_shot_grant(p_grant_id, 'period.decide', p_command_id);
  v_p := private.lock_period(v_org, p_period_id);
  if v_p.state = 'fechado' then raise exception 'PERIOD_CLOSED'; end if;
  if v_p.state <> 'aberto' then raise exception 'PERIOD_STATE_INVALID'; end if;
  if v_p.review_revision <> p_review_revision then raise exception 'STALE_REVIEW'; end if;
  v_pos := private.period_position(v_org, v_p);                                   -- recomputed under the lock
  if jsonb_array_length(v_pos -> 'pending') > 0 then raise exception 'RULE_PENDING'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind', 'above_earned', 'person_id', x ->> 'person_id', 'display_name', x ->> 'display_name',
           'earned_minor', (x ->> 'earned_minor')::bigint, 'advances_minor', (x -> 'advances' ->> 'total_minor')::bigint,
           'excess_minor', (x ->> 'excess_minor')::bigint)), '[]'::jsonb)
    into v_cases from jsonb_array_elements(v_pos -> 'people') x where (x ->> 'excess_minor')::bigint > 0;
  insert into public.period_approvals (organization_id, period_id, approved_by_person_id, review_revision, calculation_version, totals, cases, command_id)
  values (v_org, p_period_id, v_actor, p_review_revision, private.calculation_version(), v_pos - 'people', v_cases, p_command_id) returning id into v_id;
  insert into public.period_approval_lines (approval_id, organization_id, person_id, display_name, production_count, production_minor, rule_kind,
         percent, earned_minor, advances_minor, payments_minor, approved_minor, excess_minor)
  select v_id, v_org, (x ->> 'person_id')::uuid, x ->> 'display_name', (x -> 'production' ->> 'count')::int, (x -> 'production' ->> 'total_minor')::bigint,
         x -> 'rule' ->> 'kind', (x -> 'rule' ->> 'percent')::numeric, (x ->> 'earned_minor')::bigint, (x -> 'advances' ->> 'total_minor')::bigint,
         (x -> 'payments' ->> 'total_minor')::bigint, (x ->> 'remaining_minor')::bigint, (x ->> 'excess_minor')::bigint
    from jsonb_array_elements(v_pos -> 'people') x;
  v_rev := private.set_period_state(v_p, 'pronto_para_pagamento', v_actor, p_command_id);
  return private.cmd_done(p_command_id, 'approve_period', v_fp, jsonb_build_object('approval_id', v_id,
           'total_minor', (v_pos ->> 'payable_minor')::bigint, 'approved_by_person_id', v_actor, 'review_revision', v_rev));
end $$;

-- Voltar a rever (anula a aprovação): only while no payment exists against it (Slice 06 §3; guard 07 I4).
create or replace function public.annul_approval(p_command_id uuid, p_grant_id uuid, p_period_id uuid, p_review_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_fp text; v_r jsonb; v_actor uuid; v_p public.periods; v_a public.period_approvals; v_rev bigint;
begin
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or p_period_id is null or p_review_revision is null then raise exception 'VALIDATION_FAILED'; end if;
  v_fp := md5(jsonb_build_object('period', p_period_id, 'revision', p_review_revision)::text);
  v_r := private.cmd_replay(p_command_id, 'annul_approval', v_fp); if v_r is not null then return v_r; end if;
  v_actor := private.consume_one_shot_grant(p_grant_id, 'period.decide', p_command_id);
  v_p := private.lock_period(v_org, p_period_id);
  if v_p.state = 'fechado' then raise exception 'PERIOD_CLOSED'; end if;
  v_a := private.current_approval(p_period_id);
  if v_p.state <> 'pronto_para_pagamento' or v_a.id is null or exists (select 1 from public.payments y where y.approval_id = v_a.id) then
    raise exception 'PERIOD_STATE_INVALID';
  end if;
  if v_p.review_revision <> p_review_revision then raise exception 'STALE_REVIEW'; end if;
  insert into public.period_approval_annulments (approval_id, organization_id, annulled_by_person_id, review_revision, command_id)
  values (v_a.id, v_org, v_actor, p_review_revision, p_command_id);
  v_rev := private.set_period_state(v_p, 'aberto', v_actor, p_command_id);
  return private.cmd_done(p_command_id, 'annul_approval', v_fp, jsonb_build_object('approval_id', v_a.id, 'annulled_by_person_id', v_actor, 'review_revision', v_rev));
end $$;

-- Confirmar pagamento (B6): against the current approval; never above what remains approved for that person.
-- The first confirmed payment moves the period to Em pagamento.
create or replace function public.confirm_payment(p_command_id uuid, p_grant_id uuid, p_period_id uuid, p_person_id uuid, p_amount_minor bigint, p_payment_method_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_fp text; v_r jsonb; v_actor uuid; v_p public.periods; v_a public.period_approvals;
  v_line public.period_approval_lines; v_paid bigint; v_id uuid; v_now timestamptz := now(); v_rev bigint;
begin
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or p_period_id is null or p_person_id is null or p_payment_method_id is null or coalesce(p_amount_minor, 0) <= 0 then
    raise exception 'VALIDATION_FAILED';
  end if;
  v_fp := md5(jsonb_build_object('period', p_period_id, 'person', p_person_id, 'amount', p_amount_minor, 'method', p_payment_method_id)::text);
  v_r := private.cmd_replay(p_command_id, 'confirm_payment', v_fp); if v_r is not null then return v_r; end if;
  v_actor := private.consume_one_shot_grant(p_grant_id, 'payment.confirm', p_command_id);
  v_p := private.lock_period(v_org, p_period_id);
  if v_p.state = 'fechado' then raise exception 'PERIOD_CLOSED'; end if;
  if v_p.state not in ('pronto_para_pagamento', 'em_pagamento') then raise exception 'PERIOD_STATE_INVALID'; end if;
  if not exists (select 1 from public.payment_methods m where m.id = p_payment_method_id and m.organization_id = v_org and m.active)
     or not exists (select 1 from public.people where id = p_person_id and organization_id = v_org) then
    raise exception 'CROSS_TENANT_REFERENCE';
  end if;
  v_a := private.current_approval(p_period_id);
  select * into v_line from public.period_approval_lines l where l.approval_id = v_a.id and l.person_id = p_person_id;
  if v_line.approval_id is null then raise exception 'PAYMENT_EXCEEDS_APPROVED'; end if;
  select coalesce(sum(y.amount_minor), 0) into v_paid from public.payments y where y.approval_id = v_a.id and y.person_id = p_person_id;
  if p_amount_minor > v_line.approved_minor - v_paid then raise exception 'PAYMENT_EXCEEDS_APPROVED'; end if;
  insert into public.payments (organization_id, period_id, person_id, amount_minor, payment_method_id, paid_at, recorded_at, confirmed_by_person_id, command_id, approval_id)
  values (v_org, p_period_id, p_person_id, p_amount_minor, p_payment_method_id, v_now, v_now, v_actor, p_command_id, v_a.id) returning id into v_id;
  if v_p.state = 'pronto_para_pagamento' then v_rev := private.set_period_state(v_p, 'em_pagamento', v_actor, p_command_id);
  else v_rev := private.touch_period(p_period_id); end if;
  return private.cmd_done(p_command_id, 'confirm_payment', v_fp, jsonb_build_object('payment_id', v_id, 'amount_minor', p_amount_minor,
           'outstanding_minor', v_line.approved_minor - v_paid - p_amount_minor, 'paid_at', v_now, 'confirmed_by_person_id', v_actor, 'review_revision', v_rev));
end $$;

-- Fechar período (B7): the reviewed revision; blocked while any approved amount is unpaid (04 J5 Decided).
-- Persists the close statement (ADR-0007). A missing owners' decision does not block (07 I5 open): recorded as such.
create or replace function public.close_period(p_command_id uuid, p_grant_id uuid, p_period_id uuid, p_review_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_fp text; v_r jsonb; v_actor uuid; v_p public.periods; v_a public.period_approvals;
  v_lines jsonb; v_unpaid bigint; v_pos jsonb; v_id uuid; v_rev bigint;
begin
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or p_period_id is null or p_review_revision is null then raise exception 'VALIDATION_FAILED'; end if;
  v_fp := md5(jsonb_build_object('period', p_period_id, 'revision', p_review_revision)::text);
  v_r := private.cmd_replay(p_command_id, 'close_period', v_fp); if v_r is not null then return v_r; end if;
  v_actor := private.consume_one_shot_grant(p_grant_id, 'period.close', p_command_id);
  v_p := private.lock_period(v_org, p_period_id);
  if v_p.state = 'fechado' then raise exception 'PERIOD_CLOSED'; end if;
  v_a := private.current_approval(p_period_id);
  if v_p.state not in ('pronto_para_pagamento', 'em_pagamento') or v_a.id is null then raise exception 'PERIOD_STATE_INVALID'; end if;
  if v_p.review_revision <> p_review_revision then raise exception 'STALE_REVIEW'; end if;
  v_lines := private.approval_payments(v_a);
  select coalesce(sum((l ->> 'outstanding_minor')::bigint), 0) into v_unpaid from jsonb_array_elements(v_lines) l;
  if v_unpaid > 0 then raise exception 'UNPAID_APPROVED_AMOUNTS'; end if;
  v_pos := private.period_position(v_org, v_p);
  v_rev := private.set_period_state(v_p, 'fechado', v_actor, p_command_id);
  insert into public.period_close_statements (organization_id, period_id, closed_by_person_id, review_revision, calculation_version, statement, command_id)
  values (v_org, p_period_id, v_actor, v_rev, private.calculation_version(), jsonb_build_object(
      'position', v_pos,
      'approval', jsonb_build_object('id', v_a.id, 'total_minor', (v_a.totals ->> 'payable_minor')::bigint, 'lines', v_lines,
                                     'paid_minor', (select coalesce(sum((l ->> 'paid_minor')::bigint), 0) from jsonb_array_elements(v_lines) l),
                                     'payments_count', (select count(*) from public.payments y where y.approval_id = v_a.id)),
      'reserve', jsonb_build_object('allocated_minor', v_pos -> 'reserve_allocated_minor', 'used_minor', v_pos -> 'reserve_used_minor',
                                    'balance_minor', private.reserve_balance(v_org)),
      'owners_decision_recorded', v_pos -> 'owners_decision' <> 'null'::jsonb), p_command_id)
  returning id into v_id;
  return private.cmd_done(p_command_id, 'close_period', v_fp, jsonb_build_object('statement_id', v_id, 'closed_by_person_id', v_actor, 'review_revision', v_rev));
end $$;

-- Confirmer list for a boundary's permission (names only), replacing the movement.confirm-only version.
drop function if exists public.list_confirmers();
create or replace function public.list_confirmers(p_permission text default 'movement.confirm')
returns table (id uuid, display_name text) language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name from public.people p
    join private.person_permissions pp on pp.person_id = p.id and pp.permission = p_permission
    join private.person_secrets s on s.person_id = p.id
   where p.organization_id = (select private.current_org_id()) and p.active
     and p_permission in ('movement.confirm', 'period.decide', 'payment.confirm', 'period.close')
   order by p.display_name
$$;

revoke all on function public.fecho_periods(), public.fecho_period(uuid), public.fecho_money(uuid), public.fecho_rule_preview(uuid, uuid, numeric),
  public.fecho_history(uuid), public.decide_period_rule(uuid, uuid, uuid, uuid, numeric), public.record_owners_decision(uuid, uuid, uuid, text, bigint),
  public.allocate_reserve(uuid, uuid, uuid, bigint, text), public.use_reserve(uuid, uuid, uuid, uuid, bigint), public.approve_period(uuid, uuid, uuid, bigint),
  public.annul_approval(uuid, uuid, uuid, bigint), public.confirm_payment(uuid, uuid, uuid, uuid, bigint, uuid), public.close_period(uuid, uuid, uuid, bigint),
  public.list_confirmers(text) from public, anon;
grant execute on function public.fecho_periods(), public.fecho_period(uuid), public.fecho_money(uuid), public.fecho_rule_preview(uuid, uuid, numeric),
  public.fecho_history(uuid), public.decide_period_rule(uuid, uuid, uuid, uuid, numeric), public.record_owners_decision(uuid, uuid, uuid, text, bigint),
  public.allocate_reserve(uuid, uuid, uuid, bigint, text), public.use_reserve(uuid, uuid, uuid, uuid, bigint), public.approve_period(uuid, uuid, uuid, bigint),
  public.annul_approval(uuid, uuid, uuid, bigint), public.confirm_payment(uuid, uuid, uuid, uuid, bigint, uuid), public.close_period(uuid, uuid, uuid, bigint),
  public.list_confirmers(text) to authenticated;
