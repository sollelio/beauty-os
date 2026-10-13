-- Gestão · catalogue management: services (name, current price, active) and products (name, unit word, reference
-- price, active), changed only through trusted commands confirmed by a person holding catalogue.manage (one-shot
-- grant, ADR-0009; idempotent, ADR-0006). Nothing is deleted: an entry already used stays and is deactivated.
--
-- History stays as recorded: a service record keeps the value captured (service_records.value_minor) and a purchase
-- line keeps its quantity, unit word and cost (purchase_lines.unit_word / line_cost_minor). The catalogue price is only
-- the prefill for the next capture; the product reference price is information for Gestão and is used by no figure.
-- Records show the entry's current name (same entry, corrected label).
--
-- An inactive entry is not offered for new records (services: already refused by record_service; products: refused
-- on any new purchase line, by the stock plan and by create_product) and leaves the Stock lists and signals; every
-- historical record that references it is unchanged and still shown.

alter table public.products
  add column active boolean not null default true,
  add column reference_price_minor bigint check (reference_price_minor is null or reference_price_minor >= 0);

-- ---------- new purchase lines need an active product ----------
create or replace function private.purchase_line_product_active()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.products p where p.id = new.product_id and p.active) then raise exception 'CATALOGUE_INACTIVE'; end if;
  return new;
end $$;
create trigger purchase_lines_product_active before insert on public.purchase_lines
  for each row execute function private.purchase_line_product_active();
revoke all on function private.purchase_line_product_active() from public, anon, authenticated;

-- Stock Lite writes (Slice 05) only on active products.
drop policy products_stock_update_own on public.products;
create policy products_stock_update_own on public.products for update to authenticated
  using (organization_id = (select private.current_org_id()) and active)
  with check (organization_id = (select private.current_org_id()));

-- create_product (Stock sheets): a name that matches an inactive product is not silently reused.
create or replace function public.create_product(p_name text, p_unit_word text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_id uuid; v_active boolean; v_name text := trim(coalesce(p_name, '')); v_reused boolean := true;
begin
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if char_length(v_name) not between 2 and 80
     or not exists (select 1 from public.unit_words w where w.organization_id = v_org and w.word = p_unit_word) then
    raise exception 'VALIDATION_FAILED';
  end if;
  select p.id, p.active into v_id, v_active from public.products p where p.organization_id = v_org and lower(trim(p.name)) = lower(v_name);
  if v_id is not null and not v_active then raise exception 'CATALOGUE_INACTIVE'; end if;
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

-- Stock home and the Business Health stock signals: active products only (purchase facts are unchanged).
do $$
declare v_src text; v_fn text;
begin
  foreach v_fn in array array['public.stock_overview()', 'public.business_costs(uuid)'] loop
    select pg_get_functiondef(v_fn::regprocedure) into v_src;
    if position('from public.products p where p.organization_id = v_org' in v_src) = 0 then raise exception '% patch failed', v_fn; end if;
    v_src := replace(v_src, 'from public.products p where p.organization_id = v_org', 'from public.products p where p.organization_id = v_org and p.active');
    execute v_src;
  end loop;
end $$;

-- ---------- permission catalogue.manage ----------
do $$
declare v_src text;
begin
  select pg_get_functiondef('private.admin_set_permission(uuid, text, boolean)'::regprocedure) into v_src;
  v_src := replace(v_src, $q$'records.correct', 'business.health.read')$q$, $q$'records.correct', 'business.health.read', 'catalogue.manage')$q$);
  if position('catalogue.manage' in v_src) = 0 then raise exception 'admin_set_permission patch failed'; end if;
  execute v_src;
  select pg_get_functiondef('public.list_confirmers(text)'::regprocedure) into v_src;
  v_src := replace(v_src, $q$'period.reopen', 'records.correct')$q$, $q$'period.reopen', 'records.correct', 'catalogue.manage')$q$);
  if position('catalogue.manage' in v_src) = 0 then raise exception 'list_confirmers patch failed'; end if;
  execute v_src;
end $$;

-- The private-context status also says whether to offer Gestão (the commands still check the permission).
create or replace function public.private_context_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object(
       'active', true, 'person_id', p.id, 'display_name', p.display_name,
       'view', case when private.has_permission(p.id, 'team.finance.read') then 'manager' else 'self' end,
       'business_health', private.has_permission(p.id, 'business.health.read'),
       'catalogue_manage', private.has_permission(p.id, 'catalogue.manage'),
       'expires_at', (select max(g.expires_at) from private.verification_grants g
                       where g.person_id = p.id and g.scope = 'private_session' and g.revoked_at is null
                         and g.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid))
     from public.people p where p.id = (select private.current_private_person())),
    jsonb_build_object('active', false))
$$;

-- ---------- commands ----------
create or replace function private.catalogue_name(p_name text)
returns text language plpgsql immutable set search_path = '' as $$
declare v text := trim(coalesce(p_name, ''));
begin
  if char_length(v) not between 2 and 80 then raise exception 'VALIDATION_FAILED'; end if;
  return v;
end $$;

create or replace function public.catalogue_add_service(p_command_id uuid, p_grant_id uuid, p_name text, p_price_minor bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_name text; v_fp text; v_r jsonb; v_actor uuid; v_id uuid;
begin
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or p_price_minor is null or p_price_minor < 0 then raise exception 'VALIDATION_FAILED'; end if;
  v_name := private.catalogue_name(p_name);
  v_fp := md5(jsonb_build_object('name', v_name, 'price', p_price_minor)::text);
  v_r := private.cmd_replay(p_command_id, 'catalogue_add_service', v_fp); if v_r is not null then return v_r; end if;
  v_actor := private.consume_one_shot_grant(p_grant_id, 'catalogue.manage', p_command_id);
  perform pg_advisory_xact_lock(hashtextextended('catalogue:' || v_org::text, 0));
  if exists (select 1 from public.services s where s.organization_id = v_org and lower(trim(s.name)) = lower(v_name)) then raise exception 'NAME_TAKEN'; end if;
  insert into public.services (organization_id, name, default_price_minor, sort_order)
  values (v_org, v_name, p_price_minor, coalesce((select max(s.sort_order) from public.services s where s.organization_id = v_org), 0) + 1)
  returning id into v_id;
  return private.cmd_done(p_command_id, 'catalogue_add_service', v_fp,
           jsonb_build_object('service_id', v_id, 'after', jsonb_build_object('name', v_name, 'price_minor', p_price_minor, 'active', true),
                              'changed_by_person_id', v_actor));
end $$;

create or replace function public.catalogue_update_service(p_command_id uuid, p_grant_id uuid, p_service_id uuid, p_name text, p_price_minor bigint, p_active boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_name text; v_fp text; v_r jsonb; v_actor uuid; v_s public.services;
begin
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or p_service_id is null or p_price_minor is null or p_price_minor < 0 or p_active is null then raise exception 'VALIDATION_FAILED'; end if;
  v_name := private.catalogue_name(p_name);
  v_fp := md5(jsonb_build_object('service', p_service_id, 'name', v_name, 'price', p_price_minor, 'active', p_active)::text);
  v_r := private.cmd_replay(p_command_id, 'catalogue_update_service', v_fp); if v_r is not null then return v_r; end if;
  v_actor := private.consume_one_shot_grant(p_grant_id, 'catalogue.manage', p_command_id);
  perform pg_advisory_xact_lock(hashtextextended('catalogue:' || v_org::text, 0));
  select * into v_s from public.services s where s.id = p_service_id and s.organization_id = v_org for update;
  if v_s.id is null then raise exception 'CROSS_TENANT_REFERENCE'; end if;
  if exists (select 1 from public.services s where s.organization_id = v_org and s.id <> v_s.id and lower(trim(s.name)) = lower(v_name)) then
    raise exception 'NAME_TAKEN';
  end if;
  update public.services set name = v_name, default_price_minor = p_price_minor, active = p_active where id = v_s.id;
  return private.cmd_done(p_command_id, 'catalogue_update_service', v_fp, jsonb_build_object('service_id', v_s.id,
           'before', jsonb_build_object('name', v_s.name, 'price_minor', v_s.default_price_minor, 'active', v_s.active),
           'after', jsonb_build_object('name', v_name, 'price_minor', p_price_minor, 'active', p_active),
           'changed_by_person_id', v_actor));
end $$;

-- A unit word is a word on the product (Slice 03 §3); a new one joins the organization's list.
create or replace function private.catalogue_unit_word(p_org uuid, p_word text)
returns text language plpgsql security definer set search_path = '' as $$
declare v text := trim(coalesce(p_word, ''));
begin
  if char_length(v) not between 1 and 30 then raise exception 'VALIDATION_FAILED'; end if;
  insert into public.unit_words (organization_id, word, sort_order)
  values (p_org, v, coalesce((select max(w.sort_order) from public.unit_words w where w.organization_id = p_org), 0) + 1)
  on conflict do nothing;
  return v;
end $$;

create or replace function public.catalogue_add_product(p_command_id uuid, p_grant_id uuid, p_name text, p_unit_word text, p_reference_price_minor bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_name text; v_unit text; v_fp text; v_r jsonb; v_actor uuid; v_id uuid;
begin
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or coalesce(p_reference_price_minor, 0) < 0 or char_length(trim(coalesce(p_unit_word, ''))) not between 1 and 30 then
    raise exception 'VALIDATION_FAILED';
  end if;
  v_name := private.catalogue_name(p_name);
  v_fp := md5(jsonb_build_object('name', v_name, 'unit', trim(p_unit_word), 'price', p_reference_price_minor)::text);
  v_r := private.cmd_replay(p_command_id, 'catalogue_add_product', v_fp); if v_r is not null then return v_r; end if;
  v_actor := private.consume_one_shot_grant(p_grant_id, 'catalogue.manage', p_command_id);
  perform pg_advisory_xact_lock(hashtextextended('catalogue:' || v_org::text, 0));
  if exists (select 1 from public.products p where p.organization_id = v_org and lower(trim(p.name)) = lower(v_name)) then raise exception 'NAME_TAKEN'; end if;
  v_unit := private.catalogue_unit_word(v_org, p_unit_word);
  insert into public.products (organization_id, name, unit_word, reference_price_minor) values (v_org, v_name, v_unit, p_reference_price_minor)
  returning id into v_id;
  return private.cmd_done(p_command_id, 'catalogue_add_product', v_fp, jsonb_build_object('product_id', v_id,
           'after', jsonb_build_object('name', v_name, 'unit_word', v_unit, 'reference_price_minor', p_reference_price_minor, 'active', true),
           'changed_by_person_id', v_actor));
end $$;

create or replace function public.catalogue_update_product(p_command_id uuid, p_grant_id uuid, p_product_id uuid, p_name text, p_unit_word text,
                                                           p_reference_price_minor bigint, p_active boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_name text; v_unit text; v_fp text; v_r jsonb; v_actor uuid; v_p public.products;
begin
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or p_product_id is null or coalesce(p_reference_price_minor, 0) < 0 or p_active is null
     or char_length(trim(coalesce(p_unit_word, ''))) not between 1 and 30 then
    raise exception 'VALIDATION_FAILED';
  end if;
  v_name := private.catalogue_name(p_name);
  v_fp := md5(jsonb_build_object('product', p_product_id, 'name', v_name, 'unit', trim(p_unit_word), 'price', p_reference_price_minor, 'active', p_active)::text);
  v_r := private.cmd_replay(p_command_id, 'catalogue_update_product', v_fp); if v_r is not null then return v_r; end if;
  v_actor := private.consume_one_shot_grant(p_grant_id, 'catalogue.manage', p_command_id);
  perform pg_advisory_xact_lock(hashtextextended('catalogue:' || v_org::text, 0));
  select * into v_p from public.products p where p.id = p_product_id and p.organization_id = v_org for update;
  if v_p.id is null then raise exception 'CROSS_TENANT_REFERENCE'; end if;
  if exists (select 1 from public.products p where p.organization_id = v_org and p.id <> v_p.id and lower(trim(p.name)) = lower(v_name)) then
    raise exception 'NAME_TAKEN';
  end if;
  v_unit := private.catalogue_unit_word(v_org, p_unit_word);
  -- deactivating also takes the product off the purchase list (the plan ends; its stock state is left as marked)
  update public.products set name = v_name, unit_word = v_unit, reference_price_minor = p_reference_price_minor, active = p_active,
                             on_list = case when p_active then on_list else false end
   where id = v_p.id;
  return private.cmd_done(p_command_id, 'catalogue_update_product', v_fp, jsonb_build_object('product_id', v_p.id,
           'before', jsonb_build_object('name', v_p.name, 'unit_word', v_p.unit_word, 'reference_price_minor', v_p.reference_price_minor, 'active', v_p.active),
           'after', jsonb_build_object('name', v_name, 'unit_word', v_unit, 'reference_price_minor', p_reference_price_minor, 'active', p_active),
           'changed_by_person_id', v_actor));
end $$;

revoke all on function private.catalogue_name(text), private.catalogue_unit_word(uuid, text) from public, anon, authenticated;
revoke all on function public.catalogue_add_service(uuid, uuid, text, bigint), public.catalogue_update_service(uuid, uuid, uuid, text, bigint, boolean),
  public.catalogue_add_product(uuid, uuid, text, text, bigint), public.catalogue_update_product(uuid, uuid, uuid, text, text, bigint, boolean)
  from public, anon;
grant execute on function public.catalogue_add_service(uuid, uuid, text, bigint), public.catalogue_update_service(uuid, uuid, uuid, text, bigint, boolean),
  public.catalogue_add_product(uuid, uuid, text, text, bigint), public.catalogue_update_product(uuid, uuid, uuid, text, text, bigint, boolean)
  to authenticated;
