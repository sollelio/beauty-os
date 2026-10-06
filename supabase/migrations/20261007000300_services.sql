-- Slice 01 · module `services`: completed-service records (production) and the trusted `record_service` command
-- (ADR-0003 one command = one transaction; ADR-0006 command_id idempotency; ADR-0009 actor context).
-- Note: there is no period entity yet; when the `period` module is introduced, `record_service` must also change the
-- period review revision in the same transaction (ADR-0005 R-1).

create table public.service_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  person_id uuid not null,
  service_id uuid not null,
  value_minor bigint not null check (value_minor >= 0),
  payment_kind text not null check (payment_kind in ('single', 'mixed')),
  occurred_at timestamptz not null,                  -- event time (Slice 01: the moment of capture)
  recorded_at timestamptz not null default now(),    -- recording time, kept separately (Architecture Definition D-5)
  device_id uuid not null,                           -- device + declared operator: unverified attribution (ADR-0009)
  declared_operator_id uuid,
  command_id uuid not null unique,
  foreign key (organization_id, person_id) references public.people(organization_id, id),
  foreign key (organization_id, service_id) references public.services(organization_id, id),
  foreign key (organization_id, declared_operator_id) references public.people(organization_id, id)
);
create index on public.service_records (organization_id, occurred_at desc);
create index on public.service_records (organization_id, person_id, occurred_at desc);

create table public.service_record_payments (
  service_record_id uuid not null references public.service_records(id),
  organization_id uuid not null,
  payment_method_id uuid not null,
  amount_minor bigint not null check (amount_minor >= 0),
  primary key (service_record_id, payment_method_id),
  foreign key (organization_id, payment_method_id) references public.payment_methods(organization_id, id)
);
create index on public.service_record_payments (organization_id);

-- Command journal (ADR-0006). Not exposed; written only by commands.
create table private.command_journal (
  command_id uuid primary key,
  organization_id uuid not null,
  principal uuid not null,
  command_type text not null,
  fingerprint text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.service_records enable row level security;
alter table public.service_record_payments enable row level security;
revoke all on public.service_records, public.service_record_payments from anon, authenticated;
grant select on public.service_records, public.service_record_payments to authenticated;   -- no direct DML
create policy service_records_read_own on public.service_records for select to authenticated
  using (organization_id = (select private.current_org_id()));
create policy service_record_payments_read_own on public.service_record_payments for select to authenticated
  using (organization_id = (select private.current_org_id()));

-- ---------- command: record_service ----------
-- p_payments: [{"method_id": uuid, "amount_minor": int}] — one part (single method) or two parts (mixed).
create or replace function public.record_service(
  p_command_id uuid,
  p_person_id uuid,
  p_service_id uuid,
  p_value_minor bigint,
  p_payments jsonb,
  p_declared_operator_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_device uuid; v_org uuid; v_uid uuid := auth.uid();
  v_parts jsonb; v_count int; v_sum bigint; v_fp text;
  v_journal private.command_journal; v_record uuid; v_now timestamptz := now(); v_result jsonb;
begin
  select cd.device_id, cd.organization_id into v_device, v_org from private.current_device() cd;
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or p_person_id is null or p_service_id is null or p_value_minor is null
     or p_payments is null or jsonb_typeof(p_payments) <> 'array' then
    raise exception 'VALIDATION_FAILED';
  end if;

  select jsonb_agg(jsonb_build_object('method_id', (e ->> 'method_id')::uuid, 'amount_minor', (e ->> 'amount_minor')::bigint)
                   order by e ->> 'method_id'),
         count(*), sum((e ->> 'amount_minor')::bigint)
    into v_parts, v_count, v_sum
    from jsonb_array_elements(p_payments) e;

  v_fp := md5(jsonb_build_object('type', 'record_service', 'person', p_person_id, 'service', p_service_id,
                                 'value', p_value_minor, 'payments', v_parts, 'declared', p_declared_operator_id)::text);

  -- idempotency: serialise per command_id, then replay or reject
  perform pg_advisory_xact_lock(hashtextextended('cmd:' || p_command_id::text, 0));
  select * into v_journal from private.command_journal where command_id = p_command_id;
  if found then
    if v_journal.organization_id = v_org and v_journal.principal = v_uid
       and v_journal.command_type = 'record_service' and v_journal.fingerprint = v_fp then
      return v_journal.result || jsonb_build_object('replayed', true);
    end if;
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;

  -- every referenced id must belong to the device's organization
  if not exists (select 1 from public.people p where p.id = p_person_id and p.organization_id = v_org and p.active)
     or not exists (select 1 from public.services s where s.id = p_service_id and s.organization_id = v_org and s.active)
     or (p_declared_operator_id is not null
         and not exists (select 1 from public.people p where p.id = p_declared_operator_id and p.organization_id = v_org and p.active))
     or exists (select 1 from jsonb_array_elements(v_parts) e
                 where not exists (select 1 from public.payment_methods m
                                    where m.id = (e ->> 'method_id')::uuid and m.organization_id = v_org and m.active)) then
    raise exception 'CROSS_TENANT_REFERENCE';
  end if;

  if p_value_minor < 0 or v_count not in (1, 2)
     or exists (select 1 from jsonb_array_elements(v_parts) e where (e ->> 'amount_minor')::bigint is null or (e ->> 'amount_minor')::bigint < 0)
     or (v_count = 2 and (select count(distinct e ->> 'method_id') from jsonb_array_elements(v_parts) e) <> 2)
     or (v_count = 2 and exists (select 1 from jsonb_array_elements(v_parts) e where (e ->> 'amount_minor')::bigint = 0)) then
    raise exception 'VALIDATION_FAILED';
  end if;
  if v_sum <> p_value_minor then raise exception 'MIXED_PAYMENT_MISMATCH'; end if;

  insert into public.service_records (organization_id, person_id, service_id, value_minor, payment_kind,
                                      occurred_at, recorded_at, device_id, declared_operator_id, command_id)
  values (v_org, p_person_id, p_service_id, p_value_minor, case when v_count = 2 then 'mixed' else 'single' end,
          v_now, v_now, v_device, p_declared_operator_id, p_command_id)
  returning id into v_record;

  insert into public.service_record_payments (service_record_id, organization_id, payment_method_id, amount_minor)
  select v_record, v_org, (e ->> 'method_id')::uuid, (e ->> 'amount_minor')::bigint from jsonb_array_elements(v_parts) e;

  v_result := jsonb_build_object('record_id', v_record, 'occurred_at', v_now);
  insert into private.command_journal (command_id, organization_id, principal, command_type, fingerprint, result)
  values (p_command_id, v_org, v_uid, 'record_service', v_fp, v_result);
  return v_result;
end $$;

-- ---------- read contracts (caller rights: RLS applies) ----------
-- Hoje: today's count line and the most recent records, "today" in the organization's timezone.
create or replace function public.hoje_service_summary(p_recent_limit int default 4)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with org as (
    select o.id, o.timezone from public.organizations o where o.id = (select private.current_org_id())
  ),
  today as (
    select r.* from public.service_records r join org on r.organization_id = org.id
    where (r.occurred_at at time zone org.timezone)::date = (now() at time zone org.timezone)::date
  ),
  method_of as (
    select t.id, case when t.payment_kind = 'mixed' then null else (select p.payment_method_id from public.service_record_payments p where p.service_record_id = t.id) end as method_id
    from today t
  )
  select jsonb_build_object(
    'total', (select count(*) from today),
    'last_at', (select max(occurred_at) from today),
    'by_method', coalesce((
      select jsonb_agg(jsonb_build_object('code', x.code, 'label', x.label, 'count', x.n) order by x.ord)
      from (
        select m.code, m.label, m.sort_order as ord, count(*) as n
        from method_of mo join public.payment_methods m on m.id = mo.method_id group by m.code, m.label, m.sort_order
        union all
        select 'mixed', null, 32767, count(*) from today where payment_kind = 'mixed' having count(*) > 0
      ) x), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'occurred_at', t.occurred_at, 'service_name', s.name, 'person_name', p.display_name,
        'payment_kind', t.payment_kind, 'method_label', m.label, 'value_minor', t.value_minor) order by t.occurred_at desc)
      from (select * from today order by occurred_at desc limit greatest(p_recent_limit, 0)) t
      join public.services s on s.id = t.service_id
      join public.people p on p.id = t.person_id
      left join method_of mo on mo.id = t.id
      left join public.payment_methods m on m.id = mo.method_id), '[]'::jsonb))
  where exists (select 1 from org)
$$;

-- Step 1 of the flow: people who perform services, most recent activity first.
create or replace function public.capture_people()
returns table (id uuid, display_name text, capabilities text[], last_service_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.display_name,
         array(select c.label from public.person_capabilities c where c.person_id = p.id order by c.sort_order, c.label),
         (select max(r.occurred_at) from public.service_records r where r.person_id = p.id)
  from public.people p
  where p.active and exists (select 1 from public.person_capabilities c where c.person_id = p.id)
  order by 4 desc nulls last, p.display_name
$$;

-- Step 2 of the flow: the person's frequent services, derived from their history.
create or replace function public.frequent_services(p_person_id uuid, p_limit int default 5)
returns table (id uuid, name text, default_price_minor bigint, uses bigint)
language sql stable security invoker set search_path = '' as $$
  select s.id, s.name, s.default_price_minor, count(*) as uses
  from public.service_records r join public.services s on s.id = r.service_id
  where r.person_id = p_person_id and s.active and r.occurred_at > now() - interval '90 days'
  group by s.id, s.name, s.default_price_minor
  order by uses desc, s.name
  limit greatest(p_limit, 0)
$$;

revoke all on function public.record_service(uuid, uuid, uuid, bigint, jsonb, uuid), public.hoje_service_summary(int),
  public.capture_people(), public.frequent_services(uuid, int) from public, anon;
grant execute on function public.record_service(uuid, uuid, uuid, bigint, jsonb, uuid), public.hoje_service_summary(int),
  public.capture_people(), public.frequent_services(uuid, int) to authenticated;
