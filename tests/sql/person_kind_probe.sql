-- Person kind probe (Slice 3) — Beauty OS Dev only, synthetic fixtures only (seed 22, "Teste Pessoas").
-- NEVER run against production (Beauty OS Prod) or any project other than Beauty OS Dev (plukxnjnmowlnplpgsnm).
-- Every execution, including on Dev, needs explicit approval from Sollelio. It is not part of `npm run test:db` and
-- must not be added to any automated or scheduled runner.
-- A support-purpose device and a kind change are made only by operator procedures, which no browser role can execute,
-- so these paths are checked here, inside the database, through the real reads: a synthetic anonymous session enrols
-- with public.redeem_enrollment; the operator procedures run as the owner; the device then calls list_private_people,
-- list_confirmers, capture_people, verify_person and fecho_periods exactly as a phone would. Checked:
--   · every person of Dev except the seed's support identity is personnel (the default);
--   · on an operational device the support identity is in no list;
--   · on a support device it is listed for the private area, Fecho, Negócio and its confirmations — never as a worker;
--     there it enters with its PIN and reads Fecho and Negócio, and still cannot be recorded as the professional of a service;
--   · the kind procedure validates, refuses a person who works in the salon (capabilities), audits both ways; a person
--     made support leaves the tenant lists but keeps every permission (verification and Fecho reads still work);
--   · browser roles cannot execute the procedure or the visibility helper.
-- Rollback, whatever the server's transaction handling: ONE statement (a DO block); every write happens in an inner block
-- that always ends in an exception, so its savepoint is rolled back — 'probe_ok' on success (caught), the failed check
-- otherwise (re-raised: the statement fails). The synthetic auth user and session, the device, enrolment use, grants,
-- verification audits, audit rows, kind and purpose changes and the request.jwt settings all disappear.
-- Run (Beauty OS Dev only; after `cat supabase/.temp/project-ref` shows the same ref):
--   npx supabase db query --linked -f tests/sql/person_kind_probe.sql
-- Success: an empty result. Failure: the CLI prints the server error ('probe: …' for a failed check).
do $$
declare
  c_org uuid := '00000000-0000-4000-8000-0000000000fb';
  c_gestor uuid := '00000000-0000-4000-8000-00000000fbb1';    -- capabilities: personnel only
  c_gestora uuid := '00000000-0000-4000-8000-00000000fbb2';   -- PIN 151515, team.finance.read; no capability, no rule
  c_suporte uuid := '00000000-0000-4000-8000-00000000fbb6';   -- kind support; PIN 181818; every permission
  c_service uuid := '00000000-0000-4000-8000-00000000fbd1';
  c_cash uuid := '00000000-0000-4000-8000-00000000fba0';
  v_user uuid; v_sess uuid; v_dev uuid; r jsonb;
begin
  -- Dev-only guard, checked before any write: the seed-22 organization by id and name, its enrolment code by hash and
  -- label, and its support identity (seeds never run in production).
  if not exists (select 1 from public.organizations where id = c_org and name = 'Teste Pessoas')
     or not exists (select 1 from private.enrollment_codes where code_hash = encode(extensions.digest('TEST-ORG-PESSOAS-2026', 'sha256'), 'hex')
                     and organization_id = c_org and label = 'Test device Pessoas')
     or not exists (select 1 from public.people where id = c_suporte and organization_id = c_org and display_name = 'Suporte Pessoas' and kind = 'support') then
    raise exception 'probe: Dev fixtures not found — not the Beauty OS Dev database; nothing was written';
  end if;

  begin
    -- 1. existing people default to personnel: the seed's support identity is the only other kind in this database
    if (select array_agg(id) from public.people where kind <> 'personnel') is distinct from array[c_suporte] then
      raise exception 'probe: kinds %', (select jsonb_agg(jsonb_build_object('id', id, 'kind', kind)) from public.people where kind <> 'personnel'); end if;

    -- a synthetic anonymous session of Teste Pessoas, enrolled through the real command
    v_user := gen_random_uuid(); v_sess := gen_random_uuid();
    insert into auth.users (id, aud, role, is_anonymous) values (v_user, 'authenticated', 'authenticated', true);
    insert into auth.sessions (id, user_id) values (v_sess, v_user);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'session_id', v_sess, 'role', 'authenticated', 'is_anonymous', true)::text, true);
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    perform public.redeem_enrollment('TEST-ORG-PESSOAS-2026');
    select cd.device_id into v_dev from private.current_device() cd where cd.organization_id = c_org;
    if v_dev is null then raise exception 'probe: the synthetic device is not bound to Teste Pessoas'; end if;

    -- 2. an operational device: the support identity is in no list
    if exists (select 1 from public.list_private_people('private') where id = c_suporte) or exists (select 1 from public.list_private_people('fecho') where id = c_suporte)
       or exists (select 1 from public.list_private_people('negocio') where id = c_suporte) or exists (select 1 from public.list_confirmers('period.decide') where id = c_suporte)
       or exists (select 1 from public.capture_people() where id = c_suporte) then raise exception 'probe: support listed on an operational device'; end if;

    -- 3. a support device: listed where its scoped access starts — never as a worker
    perform private.admin_set_device_purpose(v_dev, 'support', 'probe');
    if not exists (select 1 from public.list_private_people('private') where id = c_suporte) or not exists (select 1 from public.list_private_people('fecho') where id = c_suporte)
       or not exists (select 1 from public.list_private_people('negocio') where id = c_suporte) or not exists (select 1 from public.list_confirmers('period.decide') where id = c_suporte)
       or not exists (select 1 from public.list_confirmers('payment.confirm') where id = c_suporte) then raise exception 'probe: support not listed on a support device'; end if;
    if exists (select 1 from public.capture_people() where id = c_suporte) then raise exception 'probe: support as a worker'; end if;
    if (select array_agg(id order by id) from public.list_private_people('fecho')) <> array[c_gestor, c_gestora, c_suporte] then
      raise exception 'probe: support device Fecho list %', (select jsonb_agg(display_name) from public.list_private_people('fecho')); end if;
    r := public.verify_person(c_suporte, '181818', 'private_session');
    if (r ->> 'ok')::boolean is not true then raise exception 'probe: support verification %', r; end if;
    perform public.fecho_periods();                                   -- Fecho read (team.finance.read): no exception
    perform public.business_health();                                 -- Negócio read (business.health.read): no exception
    begin
      perform public.record_service(gen_random_uuid(), c_suporte, c_service, 100000, jsonb_build_array(jsonb_build_object('method_id', c_cash, 'amount_minor', 100000)));
      raise exception 'probe: support recorded as the professional';
    exception when others then if sqlerrm <> 'PERSON_NOT_PERSONNEL' then raise; end if;
    end;
    perform private.admin_set_device_purpose(v_dev, 'operational', 'probe back');

    -- 4. the kind procedure: validation, a worker refused, audited both ways; permissions untouched
    begin perform private.admin_set_person_kind(c_gestora, 'support', ''); raise exception 'probe: empty reason accepted';
    exception when others then if sqlerrm <> 'VALIDATION_FAILED' then raise; end if; end;
    begin perform private.admin_set_person_kind(c_gestora, 'outro', 'probe'); raise exception 'probe: unknown kind accepted';
    exception when others then if sqlerrm <> 'VALIDATION_FAILED' then raise; end if; end;
    begin perform private.admin_set_person_kind(gen_random_uuid(), 'support', 'probe'); raise exception 'probe: unknown person accepted';
    exception when others then if sqlerrm <> 'NOT_FOUND' then raise; end if; end;
    begin perform private.admin_set_person_kind(c_gestor, 'support', 'probe'); raise exception 'probe: a worker made support';
    exception when others then if sqlerrm <> 'PERSON_IS_PERSONNEL' then raise; end if; end;
    if (select kind from public.people where id = c_gestor) <> 'personnel' then raise exception 'probe: refused change applied'; end if;

    perform private.admin_set_person_kind(c_gestora, 'support', 'probe');
    if not exists (select 1 from private.security_audit where action = 'person_kind_set' and subject = c_gestora and organization_id = c_org
                    and detail ->> 'from' = 'personnel' and detail ->> 'to' = 'support' and detail ->> 'reason' = 'probe') then raise exception 'probe: audit'; end if;
    if exists (select 1 from public.list_private_people('fecho') where id = c_gestora) or exists (select 1 from public.list_confirmers('period.decide') where id = c_gestora) then
      raise exception 'probe: support kind still listed'; end if;
    if not private.has_permission(c_gestora, 'team.finance.read') or not private.has_permission(c_gestora, 'period.decide') then raise exception 'probe: permissions lost'; end if;
    r := public.verify_person(c_gestora, '151515', 'private_session');
    if (r ->> 'ok')::boolean is not true then raise exception 'probe: verification %', r; end if;
    perform public.fecho_periods();                                   -- still a finance viewer: no exception
    perform private.admin_set_person_kind(c_gestora, 'support', 'probe again');           -- no change, no audit
    if (select count(*) from private.security_audit where action = 'person_kind_set' and subject = c_gestora) <> 1 then raise exception 'probe: no-op audited'; end if;

    perform private.admin_set_person_kind(c_gestora, 'personnel', 'probe back');
    if not exists (select 1 from private.security_audit where action = 'person_kind_set' and subject = c_gestora and detail ->> 'to' = 'personnel')
       or not exists (select 1 from public.list_private_people('fecho') where id = c_gestora) then raise exception 'probe: back to personnel'; end if;

    -- 5. browser roles cannot change a kind or call the helper
    if has_function_privilege('authenticated', 'private.admin_set_person_kind(uuid, text, text)', 'execute')
       or has_function_privilege('anon', 'private.admin_set_person_kind(uuid, text, text)', 'execute')
       or has_function_privilege('authenticated', 'private.person_shown(text)', 'execute')
       or has_function_privilege('anon', 'public.list_private_people(text)', 'execute') then raise exception 'probe: privileges'; end if;

    raise exception 'probe_ok';
  exception when others then
    if sqlerrm <> 'probe_ok' then raise; end if;
  end;
end $$;
