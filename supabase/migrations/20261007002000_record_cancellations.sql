-- Pilot corrections (Sollelio decision, 2026-10-07; narrows 07 I1 for the pilot): a mistaken service, advance, expense
-- or purchase may be CANCELLED (anulado) while its period is Aberto — by a person holding records.correct, with the
-- exact one-shot grant, a mandatory reason, who and when. Nothing is deleted or edited in place: the original stays,
-- a cancellation record references it, active read models exclude it, and the history shows both. The corrected
-- record is captured again through the normal flow. Not in Pronto para pagamento / Em pagamento / Fechado; confirmed
-- payments are not correctable here.

create table public.record_cancellations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  record_kind text not null check (record_kind in ('service', 'advance', 'expense', 'purchase')),
  record_id uuid not null unique,
  period_id uuid,
  reason text not null check (char_length(trim(reason)) between 1 and 200),
  cancelled_by_person_id uuid not null,
  cancelled_at timestamptz not null default now(),
  command_id uuid not null unique,
  foreign key (organization_id, cancelled_by_person_id) references public.people(organization_id, id)
);
alter table public.record_cancellations enable row level security;
revoke all on public.record_cancellations from anon, authenticated;

-- Active records: what every calculation and operational read uses from now on.
create view private.active_service_records as
  select r.* from public.service_records r where not exists (select 1 from public.record_cancellations c where c.record_id = r.id);
create view private.active_advances as
  select a.* from public.advances a where not exists (select 1 from public.record_cancellations c where c.record_id = a.id);
create view private.active_expenses as
  select e.* from public.expenses e where not exists (select 1 from public.record_cancellations c where c.record_id = e.id);
create view private.active_purchases as
  select p.* from public.purchases p where not exists (select 1 from public.record_cancellations c where c.record_id = p.id);
revoke all on private.active_service_records, private.active_advances, private.active_expenses, private.active_purchases from public, anon, authenticated;

-- Switch every read model (not the capture commands or their triggers) to the active views.
do $$
declare f record; v_src text; v_new text;
begin
  for f in
    select p.oid, p.proname, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
       and p.proname not in ('record_service', 'record_advance', 'record_expense', 'record_purchase', 'touch_period_of_event',
                             'cleanup_unbound_anonymous_users')
       and (p.prosrc ~ 'public\.(service_records|advances|expenses|purchases)\M')
  loop
    v_src := pg_get_functiondef(f.oid);
    v_new := regexp_replace(v_src, 'public\.service_records\M', 'private.active_service_records', 'g');
    v_new := regexp_replace(v_new, 'public\.advances\M', 'private.active_advances', 'g');
    v_new := regexp_replace(v_new, 'public\.expenses\M', 'private.active_expenses', 'g');
    v_new := regexp_replace(v_new, 'public\.purchases\M', 'private.active_purchases', 'g');
    if v_new <> v_src then execute v_new; raise notice 'active records: %.%', f.nspname, f.proname; end if;
  end loop;
end $$;

-- Person history rows carry their record id (the ⋯ correction entry, Slice 04).
do $$
declare v_src text;
begin
  select pg_get_functiondef('public.team_history(uuid, uuid, text, integer)'::regprocedure) into v_src;
  v_src := replace(v_src, $q$select 'service' as kind, r.occurred_at,$q$, $q$select 'service' as kind, r.id as record_id, r.occurred_at,$q$);
  v_src := replace(v_src, $q$select 'advance', a.occurred_at,$q$, $q$select 'advance', a.id, a.occurred_at,$q$);
  v_src := replace(v_src, $q$select 'payment', p.paid_at,$q$, $q$select 'payment', p.id, p.paid_at,$q$);
  v_src := replace(v_src, $q$select 'contribution', pu.occurred_at,$q$, $q$select 'contribution', pu.id, pu.occurred_at,$q$);
  v_src := replace(v_src, $q$'kind', f.kind, 'occurred_at', f.occurred_at,$q$, $q$'kind', f.kind, 'record_id', f.record_id, 'occurred_at', f.occurred_at,$q$);
  if position('record_id' in v_src) = 0 or (length(v_src) - length(replace(v_src, 'a.id, a.occurred_at', ''))) = 0 then raise exception 'team_history patch failed'; end if;
  execute v_src;
end $$;

-- What is being cancelled (shown before confirming; the same facts the capture success already showed).
create or replace function public.record_summary(p_kind text, p_record_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_r jsonb;
begin
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  v_r := case p_kind
    when 'service' then (select jsonb_build_object('occurred_at', r.occurred_at, 'amount_minor', r.value_minor, 'title', s.name, 'person', p.display_name)
                           from public.service_records r join public.services s on s.id = r.service_id join public.people p on p.id = r.person_id
                          where r.id = p_record_id and r.organization_id = v_org)
    when 'advance' then (select jsonb_build_object('occurred_at', a.occurred_at, 'amount_minor', a.amount_minor, 'title', 'Adiantamento', 'person', p.display_name)
                           from public.advances a join public.people p on p.id = a.person_id where a.id = p_record_id and a.organization_id = v_org)
    when 'expense' then (select jsonb_build_object('occurred_at', e.occurred_at, 'amount_minor', e.amount_minor, 'title', c.label, 'person', null)
                           from public.expenses e join public.expense_categories c on c.id = e.category_id where e.id = p_record_id and e.organization_id = v_org)
    when 'purchase' then (select jsonb_build_object('occurred_at', pu.occurred_at, 'amount_minor', pu.total_minor,
                            'title', 'Compra' || coalesce(' · ' || o.label, ''), 'person', null,
                            'line_count', (select count(*) from public.purchase_lines l where l.purchase_id = pu.id))
                           from public.purchases pu left join public.purchase_origins o on o.id = pu.origin_id where pu.id = p_record_id and pu.organization_id = v_org)
  end;
  if v_r is null then raise exception 'CROSS_TENANT_REFERENCE'; end if;
  return v_r || jsonb_build_object('kind', p_kind,
    'cancelled', (select jsonb_build_object('at', c.cancelled_at, 'reason', c.reason, 'by', p.display_name)
                    from public.record_cancellations c join public.people p on p.id = c.cancelled_by_person_id where c.record_id = p_record_id));
end $$;

-- Anular registo.
create or replace function public.cancel_record(p_command_id uuid, p_grant_id uuid, p_kind text, p_record_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_reason text := nullif(trim(coalesce(p_reason, '')), ''); v_fp text; v_r jsonb; v_actor uuid;
  v_at timestamptz; v_period uuid; v_state text; v_rev bigint; v_id uuid;
begin
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or p_record_id is null or p_kind not in ('service', 'advance', 'expense', 'purchase')
     or v_reason is null or char_length(v_reason) > 200 then
    raise exception 'VALIDATION_FAILED';
  end if;
  v_fp := md5(jsonb_build_object('kind', p_kind, 'record', p_record_id, 'reason', v_reason)::text);
  v_r := private.cmd_replay(p_command_id, 'cancel_record', v_fp); if v_r is not null then return v_r; end if;
  v_actor := private.consume_one_shot_grant(p_grant_id, 'records.correct', p_command_id);
  v_at := case p_kind
    when 'service' then (select occurred_at from public.service_records where id = p_record_id and organization_id = v_org)
    when 'advance' then (select occurred_at from public.advances where id = p_record_id and organization_id = v_org)
    when 'expense' then (select occurred_at from public.expenses where id = p_record_id and organization_id = v_org)
    when 'purchase' then (select occurred_at from public.purchases where id = p_record_id and organization_id = v_org) end;
  if v_at is null then raise exception 'CROSS_TENANT_REFERENCE'; end if;
  v_period := private.period_for(v_org, v_at);
  if v_period is not null then
    select state into v_state from public.periods where id = v_period for update;      -- R-4
    if v_state = 'fechado' then raise exception 'PERIOD_CLOSED'; end if;
    if v_state <> 'aberto' then raise exception 'PERIOD_APPROVED'; end if;
  end if;
  if exists (select 1 from public.record_cancellations where record_id = p_record_id) then raise exception 'RECORD_ALREADY_CANCELLED'; end if;
  -- an expense or purchase already marked as paid from the reserve keeps that link: cancel would leave it dangling
  if exists (select 1 from public.reserve_uses u where u.expense_id = p_record_id or u.purchase_id = p_record_id) then raise exception 'RECORD_IN_USE'; end if;
  insert into public.record_cancellations (organization_id, record_kind, record_id, period_id, reason, cancelled_by_person_id, command_id)
  values (v_org, p_kind, p_record_id, v_period, v_reason, v_actor, p_command_id) returning id into v_id;
  if v_period is not null then v_rev := private.touch_period(v_period); end if;
  return private.cmd_done(p_command_id, 'cancel_record', v_fp, jsonb_build_object('cancellation_id', v_id, 'kind', p_kind, 'record_id', p_record_id,
           'cancelled_by_person_id', v_actor, 'cancelled_at', now(), 'review_revision', v_rev));
end $$;

-- Fecho history: cancellations of the period's records, with what they were.
do $$
declare v_src text;
begin
  select pg_get_functiondef('public.fecho_history(uuid)'::regprocedure) into v_src;
  v_src := replace(v_src, $q$  ) x), '[]'::jsonb);$q$,
    $q$    union all
    select jsonb_build_object('kind', 'cancellation', 'at', c.cancelled_at, 'by', b.display_name, 'reason', c.reason, 'record_kind', c.record_kind,
             'record', public.record_summary(c.record_kind, c.record_id) - 'cancelled')
      from public.record_cancellations c join public.people b on b.id = c.cancelled_by_person_id where c.period_id = v_period.id
  ) x), '[]'::jsonb);$q$);
  if position('''cancellation''' in v_src) = 0 then raise exception 'fecho_history patch failed'; end if;
  execute v_src;
end $$;

-- records.correct joins the permission set (operator procedure and confirmer lists).
do $$
declare v_src text;
begin
  select pg_get_functiondef('private.admin_set_permission(uuid, text, boolean)'::regprocedure) into v_src;
  v_src := replace(v_src, $q$'period.close', 'period.reopen')$q$, $q$'period.close', 'period.reopen', 'records.correct')$q$);
  if position('records.correct' in v_src) = 0 then raise exception 'admin_set_permission patch failed'; end if;
  execute v_src;
  select pg_get_functiondef('public.list_confirmers(text)'::regprocedure) into v_src;
  v_src := replace(v_src, $q$'period.close', 'period.reopen')$q$, $q$'period.close', 'period.reopen', 'records.correct')$q$);
  if position('records.correct' in v_src) = 0 then raise exception 'list_confirmers patch failed'; end if;
  execute v_src;
end $$;

-- Pilot verification defaults (Sollelio, 2026-10-07): PIN of exactly 6 digits for new or changed PINs.
do $$
declare v_src text;
begin
  select pg_get_functiondef('private.admin_set_person_secret(uuid, text)'::regprocedure) into v_src;
  v_src := replace(v_src, $q$'^[0-9]{4,12}$'$q$, $q$'^[0-9]{6}$'$q$);
  if position('{6}' in v_src) = 0 then raise exception 'admin_set_person_secret patch failed'; end if;
  execute v_src;
end $$;

revoke all on function public.record_summary(text, uuid), public.cancel_record(uuid, uuid, text, uuid, text) from public, anon;
grant execute on function public.record_summary(text, uuid), public.cancel_record(uuid, uuid, text, uuid, text) to authenticated;
