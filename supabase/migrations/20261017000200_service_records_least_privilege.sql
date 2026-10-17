-- S3b · service record least privilege (pre-S3 security review, 2026-10-17).
-- Every bound device could select the whole service history of its organization straight from the API
-- (public.service_records and public.service_record_payments: every person's services, values and methods, all
-- periods). The operational-shared contract is narrower: service records "as shown on Hoje (who, service, value,
-- method)" (Architecture Definition §8), plus what Registar serviço needs to offer people and services (Slice 01).
-- Older and per-person history is personal-financial: Situação (B3/B4), Fecho, Negócio — all definer functions behind
-- a verified private context.
--   · The three operational reads that relied on RLS (SECURITY INVOKER) become SECURITY DEFINER with the organization
--     explicit on every table reference (each replaces RLS's organization_id = current_org_id(), so results are
--     unchanged row for row); signatures, defaults, response shapes, limits and the cancelled-record filter
--     (private.is_cancelled) are unchanged. A person id of another organization finds nothing, as before.
--   · Then the browser loses the tables: both read policies are dropped and SELECT is revoked, with RLS kept enabled
--     (no policy: default deny). Every write already goes through definer commands; every other read is a definer.
--   · private.is_cancelled was granted to authenticated only for these invoker reads: revoked.
-- An unbound principal gets what it got before: Hoje null, no people, no services.

create or replace function public.hoje_service_summary(p_recent_limit int default 4)
returns jsonb language sql stable security definer set search_path = '' as $$
  with org as (
    select o.id, o.timezone from public.organizations o where o.id = (select private.current_org_id())
  ),
  today as (
    select r.* from public.service_records r join org on r.organization_id = org.id
    where (r.occurred_at at time zone org.timezone)::date = (now() at time zone org.timezone)::date and not private.is_cancelled(r.id)
  ),
  method_of as (
    select t.id, case when t.payment_kind = 'mixed' then null else (select p.payment_method_id from public.service_record_payments p
                                                                     where p.service_record_id = t.id and p.organization_id = t.organization_id) end as method_id
    from today t
  )
  select jsonb_build_object(
    'total', (select count(*) from today),
    'last_at', (select max(occurred_at) from today),
    'by_method', coalesce((
      select jsonb_agg(jsonb_build_object('code', x.code, 'label', x.label, 'count', x.n) order by x.ord)
      from (
        select m.code, m.label, m.sort_order as ord, count(*) as n
        from method_of mo join public.payment_methods m on m.id = mo.method_id and m.organization_id = (select org.id from org)
        group by m.code, m.label, m.sort_order
        union all
        select 'mixed', null, 32767, count(*) from today where payment_kind = 'mixed' having count(*) > 0
      ) x), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'occurred_at', t.occurred_at, 'service_name', s.name, 'person_name', p.display_name,
        'payment_kind', t.payment_kind, 'method_label', m.label, 'value_minor', t.value_minor) order by t.occurred_at desc)
      from (select * from today order by occurred_at desc limit greatest(p_recent_limit, 0)) t
      join public.services s on s.id = t.service_id and s.organization_id = t.organization_id
      join public.people p on p.id = t.person_id and p.organization_id = t.organization_id
      left join method_of mo on mo.id = t.id
      left join public.payment_methods m on m.id = mo.method_id and m.organization_id = t.organization_id), '[]'::jsonb))
  where exists (select 1 from org)
$$;

create or replace function public.capture_people()
returns table (id uuid, display_name text, capabilities text[], last_service_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name,
         array(select c.label from public.person_capabilities c
                where c.person_id = p.id and c.organization_id = p.organization_id order by c.sort_order, c.label),
         (select max(r.occurred_at) from public.service_records r
           where r.person_id = p.id and r.organization_id = p.organization_id and not private.is_cancelled(r.id))
  from public.people p
  where p.organization_id = (select private.current_org_id()) and p.active
    and exists (select 1 from public.person_capabilities c where c.person_id = p.id and c.organization_id = p.organization_id)
  order by 4 desc nulls last, p.display_name
$$;

create or replace function public.frequent_services(p_person_id uuid, p_limit int default 5)
returns table (id uuid, name text, default_price_minor bigint, uses bigint)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.default_price_minor, count(*) as uses
  from public.service_records r join public.services s on s.id = r.service_id and s.organization_id = r.organization_id
  where r.organization_id = (select private.current_org_id())
    and r.person_id = p_person_id and s.active and not private.is_cancelled(r.id) and r.occurred_at > now() - interval '90 days'
  group by s.id, s.name, s.default_price_minor
  order by uses desc, s.name
  limit greatest(p_limit, 0)
$$;

revoke all on function public.hoje_service_summary(int), public.capture_people(), public.frequent_services(uuid, int) from public, anon;
grant execute on function public.hoje_service_summary(int), public.capture_people(), public.frequent_services(uuid, int) to authenticated;

-- The browser loses direct access to the service history; RLS stays enabled with no policy (default deny).
drop policy if exists service_records_read_own on public.service_records;
drop policy if exists service_record_payments_read_own on public.service_record_payments;
revoke all on public.service_records, public.service_record_payments from anon, authenticated;
alter table public.service_records enable row level security;
alter table public.service_record_payments enable row level security;
revoke all on function private.is_cancelled(uuid) from public, anon, authenticated;

-- Self-test (catalog only, nothing written): the end state above, and no other browser path to the tables.
do $$
declare v_fn text; v_n int;
begin
  foreach v_fn in array array['public.hoje_service_summary(integer)', 'public.capture_people()', 'public.frequent_services(uuid,integer)'] loop
    if not exists (select 1 from pg_catalog.pg_proc where oid = v_fn::regprocedure and prosecdef and proconfig = array['search_path=""'])
      then raise exception 'selftest: % is not a definer with an empty search_path', v_fn; end if;
    if not has_function_privilege('authenticated', v_fn, 'execute') then raise exception 'selftest: % not executable by devices', v_fn; end if;
    if has_function_privilege('anon', v_fn, 'execute') then raise exception 'selftest: % executable by anon', v_fn; end if;
  end loop;
  foreach v_fn in array array['public.service_records', 'public.service_record_payments'] loop
    if has_table_privilege('authenticated', v_fn, 'select') or has_table_privilege('anon', v_fn, 'select')
      then raise exception 'selftest: % still selectable', v_fn; end if;
    if not (select relrowsecurity from pg_catalog.pg_class where oid = v_fn::regclass) then raise exception 'selftest: % without RLS', v_fn; end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename in ('service_records', 'service_record_payments'))
    then raise exception 'selftest: a policy remains'; end if;
  if has_function_privilege('authenticated', 'private.is_cancelled(uuid)', 'execute') then raise exception 'selftest: is_cancelled executable'; end if;
  -- no invoker function a device can execute reads the tables (it would now fail, or bypass the definers)
  select count(*) into v_n from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and not p.prosecdef and p.prokind = 'f'
     and p.prosrc ~ '(service_records|service_record_payments|is_cancelled|active_service_records)'
     and has_function_privilege('authenticated', p.oid, 'execute');
  if v_n > 0 then raise exception 'selftest: % invoker function(s) still read service records', v_n; end if;
  -- no view a device can select reads them
  select count(*) into v_n from pg_catalog.pg_views v
   where v.schemaname in ('public', 'private') and v.definition ~ '(service_records|service_record_payments)'
     and has_table_privilege('authenticated', format('%I.%I', v.schemaname, v.viewname), 'select');
  if v_n > 0 then raise exception 'selftest: % view(s) expose service records', v_n; end if;
end $$;
