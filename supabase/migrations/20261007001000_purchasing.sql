-- Slice 03 · module `purchasing`: the purchase aggregate (lines + contributions + optional origin), recorded atomically.
-- Contributions are at total-purchase level (04 J3 `Decided`); the sum of contributors equals the total; the salon's
-- share may be zero (Slice 03 correction pass). No payment method is captured for purchases (Slice 03 §5).
-- New products named in a line are created on the way; an existing product with the same name is reused.
-- Stock state is never changed here (Slice 05). Business-financial data: no direct browser read/DML.
-- When the `period` module exists, `record_purchase` must also change the period review revision (ADR-0005 R-1).

create table public.purchase_origins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  label text not null,
  sort_order smallint not null default 0,
  active boolean not null default true,
  unique (organization_id, id)
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  total_minor bigint not null check (total_minor > 0),
  origin_id uuid,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  device_id uuid not null,
  declared_operator_id uuid,
  confirmed_by_person_id uuid not null,
  command_id uuid not null unique,
  unique (organization_id, id),
  foreign key (organization_id, origin_id) references public.purchase_origins(organization_id, id),
  foreign key (organization_id, declared_operator_id) references public.people(organization_id, id),
  foreign key (organization_id, confirmed_by_person_id) references public.people(organization_id, id)
);
create index on public.purchases (organization_id, occurred_at desc);

create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null,
  organization_id uuid not null,
  product_id uuid not null,
  quantity int not null check (quantity between 1 and 9999),
  unit_word text not null,                           -- the product's unit word at the time of purchase
  line_cost_minor bigint not null check (line_cost_minor >= 0),
  position smallint not null,
  unique (purchase_id, product_id),
  foreign key (organization_id, purchase_id) references public.purchases(organization_id, id),
  foreign key (organization_id, product_id) references public.products(organization_id, id)
);
create index on public.purchase_lines (organization_id, product_id);

create table public.purchase_contributions (
  purchase_id uuid not null,
  organization_id uuid not null,
  contributor_kind text not null check (contributor_kind in ('salon', 'person')),
  person_id uuid,
  amount_minor bigint not null check (amount_minor > 0),
  check ((contributor_kind = 'salon') = (person_id is null)),
  foreign key (organization_id, purchase_id) references public.purchases(organization_id, id),
  foreign key (organization_id, person_id) references public.people(organization_id, id)
);
create unique index purchase_contributions_one_per_contributor
  on public.purchase_contributions (purchase_id, coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.purchase_origins enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_lines enable row level security;
alter table public.purchase_contributions enable row level security;
revoke all on public.purchase_origins, public.purchases, public.purchase_lines, public.purchase_contributions from anon, authenticated;
grant select on public.purchase_origins to authenticated;                       -- operational list for capture
create policy purchase_origins_read_own on public.purchase_origins for select to authenticated
  using (organization_id = (select private.current_org_id()));
-- purchases / purchase_lines / purchase_contributions: no grants, no policies.

-- p_lines: [{"product_id": uuid} | {"new_product": {"name": text, "unit_word": text}}, + "quantity": int, "line_cost_minor": int]
-- p_salon_amount_minor: the salon's share (>= 0; 0 = the salon does not contribute)
-- p_contributions: [{"person_id": uuid, "amount_minor": int}] — other contributors, each > 0
create or replace function public.record_purchase(
  p_command_id uuid,
  p_grant_id uuid,
  p_lines jsonb,
  p_salon_amount_minor bigint,
  p_contributions jsonb,
  p_origin_id uuid default null,
  p_declared_operator_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_device uuid; v_org uuid; v_uid uuid := auth.uid(); v_now timestamptz := now();
  v_lines jsonb; v_contribs jsonb; v_total bigint; v_contrib_sum bigint; v_fp text; v_journal private.command_journal;
  v_confirmer uuid; v_purchase uuid; v_result jsonb; v_line jsonb; v_product uuid; v_unit text; v_pos int := 0; v_new int := 0;
begin
  select cd.device_id, cd.organization_id into v_device, v_org from private.current_device() cd;
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or p_lines is null or jsonb_typeof(p_lines) <> 'array' or p_salon_amount_minor is null
     or p_contributions is null or jsonb_typeof(p_contributions) <> 'array' then
    raise exception 'VALIDATION_FAILED';
  end if;

  -- canonical form for the fingerprint: lines keyed by product id or normalized new-product name, sorted
  select jsonb_agg(x.line order by x.k), sum((x.line ->> 'line_cost_minor')::bigint)
    into v_lines, v_total
    from (
      select case when e ? 'product_id' then 'p:' || (e ->> 'product_id')
                  else 'n:' || lower(trim(e -> 'new_product' ->> 'name')) end as k,
             jsonb_build_object(
               'product_id', (e ->> 'product_id')::uuid,
               'new_name', nullif(trim(e -> 'new_product' ->> 'name'), ''),
               'new_unit', e -> 'new_product' ->> 'unit_word',
               'quantity', (e ->> 'quantity')::int,
               'line_cost_minor', (e ->> 'line_cost_minor')::bigint) as line
        from jsonb_array_elements(p_lines) e
    ) x;
  select coalesce(jsonb_agg(jsonb_build_object('person_id', (e ->> 'person_id')::uuid, 'amount_minor', (e ->> 'amount_minor')::bigint)
                            order by e ->> 'person_id'), '[]'::jsonb),
         coalesce(sum((e ->> 'amount_minor')::bigint), 0)
    into v_contribs, v_contrib_sum
    from jsonb_array_elements(p_contributions) e;

  v_fp := md5(jsonb_build_object('type', 'record_purchase', 'lines', v_lines, 'salon', p_salon_amount_minor,
                                 'contributions', v_contribs, 'origin', p_origin_id, 'declared', p_declared_operator_id)::text);

  perform pg_advisory_xact_lock(hashtextextended('cmd:' || p_command_id::text, 0));
  select * into v_journal from private.command_journal where command_id = p_command_id;
  if found then
    if v_journal.organization_id = v_org and v_journal.principal = v_uid
       and v_journal.command_type = 'record_purchase' and v_journal.fingerprint = v_fp then
      return v_journal.result || jsonb_build_object('replayed', true);
    end if;
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;

  -- references must belong to the device's organization
  if exists (select 1 from jsonb_array_elements(v_lines) l
              where l ->> 'product_id' is not null
                and not exists (select 1 from public.products p where p.id = (l ->> 'product_id')::uuid and p.organization_id = v_org))
     or exists (select 1 from jsonb_array_elements(v_contribs) c
                 where not exists (select 1 from public.people p where p.id = (c ->> 'person_id')::uuid and p.organization_id = v_org and p.active))
     or (p_origin_id is not null
         and not exists (select 1 from public.purchase_origins o where o.id = p_origin_id and o.organization_id = v_org and o.active))
     or (p_declared_operator_id is not null
         and not exists (select 1 from public.people p where p.id = p_declared_operator_id and p.organization_id = v_org and p.active)) then
    raise exception 'CROSS_TENANT_REFERENCE';
  end if;

  -- shape
  if jsonb_array_length(v_lines) < 1 or jsonb_array_length(v_lines) > 100 or v_total is null or v_total <= 0 or p_salon_amount_minor < 0
     or exists (select 1 from jsonb_array_elements(v_lines) l
                 where (l ->> 'quantity') is null or (l ->> 'quantity')::int not between 1 and 9999
                    or (l ->> 'line_cost_minor') is null or (l ->> 'line_cost_minor')::bigint < 0
                    or ((l ->> 'product_id') is null and (
                          (l ->> 'new_name') is null or char_length(l ->> 'new_name') not between 2 and 80
                          or not exists (select 1 from public.unit_words w where w.organization_id = v_org and w.word = l ->> 'new_unit'))))
     or (select count(*) from jsonb_array_elements(v_lines)) <>
        (select count(distinct coalesce(l ->> 'product_id', 'n:' || lower(l ->> 'new_name'))) from jsonb_array_elements(v_lines) l)
     or exists (select 1 from jsonb_array_elements(v_contribs) c where (c ->> 'amount_minor') is null or (c ->> 'amount_minor')::bigint <= 0)
     or (select count(*) from jsonb_array_elements(v_contribs)) <>
        (select count(distinct c ->> 'person_id') from jsonb_array_elements(v_contribs) c) then
    raise exception 'VALIDATION_FAILED';
  end if;
  if p_salon_amount_minor + v_contrib_sum <> v_total then raise exception 'CONTRIBUTIONS_MISMATCH'; end if;

  v_confirmer := private.consume_one_shot_grant(p_grant_id, 'movement.confirm', p_command_id);

  insert into public.purchases (organization_id, total_minor, origin_id, occurred_at, recorded_at, device_id,
                                declared_operator_id, confirmed_by_person_id, command_id)
  values (v_org, v_total, p_origin_id, v_now, v_now, v_device, p_declared_operator_id, v_confirmer, p_command_id)
  returning id into v_purchase;

  for v_line in select l from jsonb_array_elements(p_lines) l loop      -- keep the operator's line order
    v_pos := v_pos + 1;
    if v_line ? 'product_id' then
      select p.id, p.unit_word into v_product, v_unit from public.products p where p.id = (v_line ->> 'product_id')::uuid;
    else
      select p.id, p.unit_word into v_product, v_unit from public.products p
       where p.organization_id = v_org and lower(trim(p.name)) = lower(trim(v_line -> 'new_product' ->> 'name'));
      if v_product is null then
        insert into public.products (organization_id, name, unit_word)
        values (v_org, trim(v_line -> 'new_product' ->> 'name'), v_line -> 'new_product' ->> 'unit_word')
        returning id, unit_word into v_product, v_unit;
        v_new := v_new + 1;
      end if;
    end if;
    insert into public.purchase_lines (purchase_id, organization_id, product_id, quantity, unit_word, line_cost_minor, position)
    values (v_purchase, v_org, v_product, (v_line ->> 'quantity')::int, v_unit, (v_line ->> 'line_cost_minor')::bigint, v_pos);
  end loop;

  if p_salon_amount_minor > 0 then
    insert into public.purchase_contributions (purchase_id, organization_id, contributor_kind, person_id, amount_minor)
    values (v_purchase, v_org, 'salon', null, p_salon_amount_minor);
  end if;
  insert into public.purchase_contributions (purchase_id, organization_id, contributor_kind, person_id, amount_minor)
  select v_purchase, v_org, 'person', (c ->> 'person_id')::uuid, (c ->> 'amount_minor')::bigint from jsonb_array_elements(v_contribs) c;

  v_result := jsonb_build_object(
    'purchase_id', v_purchase, 'occurred_at', v_now, 'total_minor', v_total,
    'line_count', jsonb_array_length(v_lines), 'new_product_count', v_new,
    'salon_amount_minor', p_salon_amount_minor,
    'contributors', (select coalesce(jsonb_agg(jsonb_build_object('person_id', c.person_id, 'display_name', pe.display_name, 'amount_minor', c.amount_minor)
                                               order by pe.display_name), '[]'::jsonb)
                       from public.purchase_contributions c join public.people pe on pe.id = c.person_id
                      where c.purchase_id = v_purchase),
    'confirmed_by_person_id', v_confirmer);
  insert into private.command_journal (command_id, organization_id, principal, command_type, fingerprint, result)
  values (p_command_id, v_org, v_uid, 'record_purchase', v_fp, v_result);
  return v_result;
end $$;

revoke all on function public.record_purchase(uuid, uuid, jsonb, bigint, jsonb, uuid, uuid) from public, anon;
grant execute on function public.record_purchase(uuid, uuid, jsonb, bigint, jsonb, uuid, uuid) to authenticated;
