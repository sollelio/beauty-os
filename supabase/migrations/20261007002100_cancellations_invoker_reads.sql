-- The three Slice 01 reads that run with the caller's rights (RLS scopes them) cannot read the private active-record
-- views. They keep reading public.service_records under RLS and exclude cancelled records through a definer check
-- that reveals only whether a given record id was cancelled.
create or replace function private.is_cancelled(p_record_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.record_cancellations c where c.record_id = p_record_id)
$$;
revoke all on function private.is_cancelled(uuid) from public, anon;
grant execute on function private.is_cancelled(uuid) to authenticated;

do $$
declare v_src text;
begin
  select pg_get_functiondef('public.hoje_service_summary(integer)'::regprocedure) into v_src;
  v_src := replace(v_src, $q$select r.* from private.active_service_records r join org on r.organization_id = org.id$q$,
                          $q$select r.* from public.service_records r join org on r.organization_id = org.id$q$);
  v_src := replace(v_src, $q$where (r.occurred_at at time zone org.timezone)::date = (now() at time zone org.timezone)::date$q$,
                          $q$where (r.occurred_at at time zone org.timezone)::date = (now() at time zone org.timezone)::date and not private.is_cancelled(r.id)$q$);
  if position('is_cancelled' in v_src) = 0 or position('active_service_records' in v_src) > 0 then raise exception 'hoje patch failed'; end if;
  execute v_src;

  select pg_get_functiondef('public.capture_people()'::regprocedure) into v_src;
  v_src := replace(v_src, $q$(select max(r.occurred_at) from private.active_service_records r where r.person_id = p.id)$q$,
                          $q$(select max(r.occurred_at) from public.service_records r where r.person_id = p.id and not private.is_cancelled(r.id))$q$);
  if position('is_cancelled' in v_src) = 0 or position('active_service_records' in v_src) > 0 then raise exception 'capture_people patch failed'; end if;
  execute v_src;

  select pg_get_functiondef('public.frequent_services(uuid, integer)'::regprocedure) into v_src;
  v_src := replace(v_src, $q$from private.active_service_records r join public.services s on s.id = r.service_id$q$,
                          $q$from public.service_records r join public.services s on s.id = r.service_id$q$);
  v_src := replace(v_src, $q$where r.person_id = p_person_id and s.active$q$, $q$where r.person_id = p_person_id and s.active and not private.is_cancelled(r.id)$q$);
  if position('is_cancelled' in v_src) = 0 or position('active_service_records' in v_src) > 0 then raise exception 'frequent_services patch failed'; end if;
  execute v_src;
end $$;
