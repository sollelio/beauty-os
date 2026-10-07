-- Slice 05 · module `stock`: Stock Lite on the existing product catalogue (Slice 03).
-- Human-set state OK · Baixo · Comprar, an optional approximate level, unopened reserve units and the purchase plan
-- (on list · planned quantity · urgent) — mutable current state with an append-only change history (D-11),
-- written directly under RLS (Architecture Definition §315: low-risk human judgement, last write wins).
-- Nothing here is computed from services or purchases, and record_purchase never touches these columns:
-- "bought today" and purchase history are read models over Slice 03 purchase lines.

alter table public.products
  add column purpose text check (purpose is null or char_length(trim(purpose)) between 1 and 40),
  add column state text not null default 'ok' check (state in ('ok', 'baixo', 'comprar')),
  add column level text check (level is null or level in ('cheio', 'metade', 'quase_vazio', 'vazio')),
  add column reserve_units int not null default 0 check (reserve_units between 0 and 999),
  add column marked_at timestamptz,                  -- when a person set Baixo/Comprar; cleared on OK (system-set)
  add column on_list boolean not null default false,
  add column planned_qty int check (planned_qty is null or planned_qty between 1 and 9999),
  add column urgent boolean not null default false,
  add column stock_updated_at timestamptz;

-- Append-only: who/what device and when, the state/level/reserve before and after. No grants; read via function.
create table public.product_state_changes (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  product_id uuid not null,
  changed_at timestamptz not null default now(),
  device_id uuid,                                    -- the shared device (unverified attribution, Slice 05 Q5)
  from_state text, to_state text not null,
  from_level text, to_level text,
  from_reserve int, to_reserve int not null,
  foreign key (organization_id, product_id) references public.products(organization_id, id)
);
create index on public.product_state_changes (organization_id, product_id, changed_at desc);
alter table public.product_state_changes enable row level security;
revoke all on public.product_state_changes from anon, authenticated;

-- System-derived columns and plan coherence. Only the stock columns are updatable by the browser (grants below).
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
      select l.quantity from public.purchase_lines l join public.purchases pu on pu.id = l.purchase_id
       where l.product_id = new.id order by pu.occurred_at desc limit 1), 1);
  end if;
  if (new.state, new.level, new.reserve_units, new.on_list, new.planned_qty, new.urgent, new.purpose)
     is distinct from (old.state, old.level, old.reserve_units, old.on_list, old.planned_qty, old.urgent, old.purpose) then
    new.stock_updated_at := now();
  end if;
  return new;
end $$;

create or replace function private.products_stock_after_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.state, new.level, new.reserve_units) is distinct from (old.state, old.level, old.reserve_units) then
    insert into public.product_state_changes (organization_id, product_id, device_id, from_state, to_state,
                                              from_level, to_level, from_reserve, to_reserve)
    values (new.organization_id, new.id, (select cd.device_id from private.current_device() cd),
            old.state, new.state, old.level, new.level, old.reserve_units, new.reserve_units);
  end if;
  return null;
end $$;

create trigger products_stock_before_update before update on public.products
  for each row execute function private.products_stock_before_update();
create trigger products_stock_after_update after update on public.products
  for each row execute function private.products_stock_after_update();
revoke all on function private.products_stock_before_update(), private.products_stock_after_update() from public, anon, authenticated;

-- Shared-device writes (B1): own organization only; identity columns (name, unit, organization) stay read-only.
grant update (state, level, reserve_units, on_list, planned_qty, urgent) on public.products to authenticated;
create policy products_stock_update_own on public.products for update to authenticated
  using (organization_id = (select private.current_org_id()))
  with check (organization_id = (select private.current_org_id()));

-- "Criar produto novo" from the list / substitution / unplanned sheets (Slice 05 §8 Q7: same rule as Slice 03 —
-- an existing product with the same name is reused). New products start OK.
create or replace function public.create_product(p_name text, p_unit_word text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_id uuid; v_name text := trim(coalesce(p_name, '')); v_reused boolean := true;
begin
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if char_length(v_name) not between 2 and 80
     or not exists (select 1 from public.unit_words w where w.organization_id = v_org and w.word = p_unit_word) then
    raise exception 'VALIDATION_FAILED';
  end if;
  select p.id into v_id from public.products p where p.organization_id = v_org and lower(trim(p.name)) = lower(v_name);
  if v_id is null then
    insert into public.products (organization_id, name, unit_word) values (v_org, v_name, p_unit_word)
    on conflict do nothing returning id into v_id;
    v_reused := v_id is null;
    if v_id is null then
      select p.id into v_id from public.products p where p.organization_id = v_org and lower(trim(p.name)) = lower(v_name);
    end if;
  end if;
  return jsonb_build_object('product_id', v_id, 'reused', v_reused);
end $$;

-- Stock home / list read model: every product with its human state and the purchase facts beside it.
-- Line cost appears only as "última compra" context; no totals, no who-paid, no contributions (Slice 05 §6).
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
                          from public.purchase_lines l join public.purchases pu on pu.id = l.purchase_id
                          left join public.purchase_origins o on o.id = pu.origin_id
                         where l.product_id = p.id order by pu.occurred_at desc limit 1),
      'bought_today', (select jsonb_build_object('quantity', sum(l.quantity), 'unit_word', p.unit_word)
                         from public.purchase_lines l join public.purchases pu on pu.id = l.purchase_id
                        where l.product_id = p.id
                          and (pu.occurred_at at time zone v_tz)::date = (now() at time zone v_tz)::date
                       having count(*) > 0))
      order by lower(p.name))
    from public.products p where p.organization_id = v_org), '[]'::jsonb);
end $$;

-- Purchases of one product (K8): date · quantity × unit · line cost · where, and the mark observation
-- "Marcado «baixo» · date · n dias depois da compra" (a fact, not a rate).
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
      from public.purchase_lines l join public.purchases pu on pu.id = l.purchase_id
     where l.product_id = v_p.id and pu.occurred_at <= v_p.marked_at;
  end if;
  return jsonb_build_object(
    'purchases', coalesce((select jsonb_agg(x order by x ->> 'occurred_at' desc) from (
        select jsonb_build_object('occurred_at', pu.occurred_at, 'quantity', l.quantity, 'unit_word', l.unit_word,
                                  'line_cost_minor', l.line_cost_minor, 'origin', o.label) as x
          from public.purchase_lines l join public.purchases pu on pu.id = l.purchase_id
          left join public.purchase_origins o on o.id = pu.origin_id
         where l.product_id = v_p.id order by pu.occurred_at desc limit greatest(p_limit, 0)) h), '[]'::jsonb),
    'mark', case when v_p.marked_at is null then null else jsonb_build_object(
        'state', v_p.state, 'marked_at', v_p.marked_at,
        'days_after_purchase', (v_p.marked_at at time zone v_tz)::date - v_last) end);
end $$;

-- Append-only state history of one product (audit; D-11).
create or replace function public.product_state_history(p_product_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id();
begin
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if not exists (select 1 from public.products where id = p_product_id and organization_id = v_org) then
    raise exception 'CROSS_TENANT_REFERENCE';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('changed_at', c.changed_at, 'from_state', c.from_state, 'to_state', c.to_state,
                     'from_level', c.from_level, 'to_level', c.to_level, 'from_reserve', c.from_reserve, 'to_reserve', c.to_reserve)
                     order by c.id)
                   from public.product_state_changes c where c.product_id = p_product_id and c.organization_id = v_org), '[]'::jsonb);
end $$;

revoke all on function public.create_product(text, text), public.stock_overview(), public.product_purchase_history(uuid, int),
  public.product_state_history(uuid) from public, anon;
grant execute on function public.create_product(text, text), public.stock_overview(), public.product_purchase_history(uuid, int),
  public.product_state_history(uuid) to authenticated;
