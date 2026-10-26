-- Slice 3 (Sollelio, 2026-10-26; architecture review F/G): identity selectors by purpose, and the support identity kept
-- apart from salon personnel. Interim step inside today's boundary — it does not replace the future platform-level
-- Sollelio Console (a support principal outside tenant personnel, which needs its own ADR).
--   · public.people.kind: 'personnel' (the default: every existing and new person) or 'support' (the organization-scoped
--     Sollelio Support identity, 07 D7 "Decided temporary"). Changed only by an audited operator procedure. No
--     membership is added or removed; permissions, PIN, verification and every server check are unchanged.
--   · Tenant-facing person lists show personnel only. A support identity is shown only on a support-purpose device
--     (ADR-0010 §5 amendment, Slice 1) — where Sollelio's own support access happens — in the lists that lead to its
--     scoped access (private entry, confirmers). It is never a worker or a contributor (capture, team, contributors).
--   · list_private_people(p_purpose): 'private' (everyone with a PIN, as before — professionals open their own
--     situation), 'fecho' (holders of team.finance.read, which every Fecho read requires), 'negocio' (holders of
--     business.health.read, which every Negócio read requires). A list is a convenience, never an authorization: the
--     server still checks the permission on every read and command.

-- ---------- person kind ----------
alter table public.people add column kind text not null default 'personnel' check (kind in ('personnel', 'support'));

-- Whether a person of this kind appears in this device's tenant-facing lists.
create or replace function private.person_shown(p_kind text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_kind = 'personnel'
      or (p_kind = 'support' and exists (select 1 from private.current_device() c join private.devices d on d.id = c.device_id where d.purpose = 'support'))
$$;
revoke all on function private.person_shown(text) from public, anon, authenticated;

-- ---------- private entry: by purpose ----------
drop function public.list_private_people();
create or replace function public.list_private_people(p_purpose text default 'private')
returns table (id uuid, display_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_purpose is null or p_purpose not in ('private', 'fecho', 'negocio') then raise exception 'VALIDATION_FAILED'; end if;
  return query
    select p.id, p.display_name
    from public.people p join private.person_secrets s on s.person_id = p.id
    where p.organization_id = (select private.current_org_id()) and p.active and private.person_shown(p.kind)
      and (p_purpose = 'private'
           or private.has_permission(p.id, case p_purpose when 'fecho' then 'team.finance.read' else 'business.health.read' end))
    order by p.display_name;
end $$;
revoke all on function public.list_private_people(text) from public, anon;
grant execute on function public.list_private_people(text) to authenticated;

-- ---------- confirmers, workers: patched in place (abort unless each anchor occurs once) ----------
do $$
declare v_src text; v_a text;
begin
  v_src := pg_get_functiondef('public.list_confirmers(text)'::regprocedure);
  v_a := $a$where p.organization_id = (select private.current_org_id()) and p.active$a$;
  if (length(v_src) - length(replace(v_src, v_a, ''))) / length(v_a) <> 1 then raise exception 'person kind patch: list_confirmers anchor not found once'; end if;
  execute replace(v_src, v_a, v_a || ' and private.person_shown(p.kind)');

  v_src := pg_get_functiondef('public.capture_people()'::regprocedure);
  v_a := $a$where p.organization_id = (select private.current_org_id()) and p.active$a$;
  if (length(v_src) - length(replace(v_src, v_a, ''))) / length(v_a) <> 1 then raise exception 'person kind patch: capture_people anchor not found once'; end if;
  execute replace(v_src, v_a, v_a || $b$ and p.kind = 'personnel'$b$);

  v_src := pg_get_functiondef('public.team_people()'::regprocedure);
  v_a := $a$where p.organization_id = private.current_org_id() and p.active$a$;
  if (length(v_src) - length(replace(v_src, v_a, ''))) / length(v_a) <> 1 then raise exception 'person kind patch: team_people anchor not found once'; end if;
  execute replace(v_src, v_a, v_a || $b$ and p.kind = 'personnel'$b$);
end $$;

-- ---------- operator procedure (not executable by browser roles) ----------
-- A person with service capabilities or a remuneration rule works in the salon: never support.
create or replace function private.admin_set_person_kind(p_person uuid, p_kind text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_p public.people;
begin
  if p_kind is null or p_kind not in ('personnel', 'support') or coalesce(trim(p_reason), '') = '' then raise exception 'VALIDATION_FAILED'; end if;
  select * into v_p from public.people where id = p_person for update;
  if v_p.id is null then raise exception 'NOT_FOUND'; end if;
  if v_p.kind = p_kind then return; end if;
  if p_kind = 'support' and (exists (select 1 from public.person_capabilities c where c.person_id = p_person)
                             or exists (select 1 from public.rule_versions r where r.person_id = p_person)) then
    raise exception 'PERSON_IS_PERSONNEL';
  end if;
  update public.people set kind = p_kind where id = p_person;
  perform private.audit('person_kind_set', v_p.organization_id, p_person,
    jsonb_build_object('from', v_p.kind, 'to', p_kind, 'display_name', v_p.display_name, 'reason', trim(p_reason)));
end $$;
revoke all on function private.admin_set_person_kind(uuid, text, text) from public, anon, authenticated;

-- Self-test on a throwaway organization, rolled back: new people are personnel; the procedure validates, refuses a
-- worker, audits; the lists exclude support (no device here: never a support device) and filter by purpose.
do $$
declare v_org uuid := gen_random_uuid(); v_m uuid := gen_random_uuid(); v_w uuid := gen_random_uuid(); v_s uuid := gen_random_uuid();
begin
  begin
    insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values (v_org, 'selftest', 'Africa/Luanda', 'XXX', 2, 'X');
    insert into public.people (id, organization_id, display_name) values (v_m, v_org, 'm'), (v_w, v_org, 'w'), (v_s, v_org, 's');
    if exists (select 1 from public.people where organization_id = v_org and kind <> 'personnel') then raise exception 'selftest: default kind'; end if;
    insert into public.person_capabilities (organization_id, person_id, label, sort_order) values (v_org, v_w, 'x', 1);
    begin perform private.admin_set_person_kind(v_w, 'support', 'selftest'); raise exception 'selftest: worker accepted';
    exception when others then if sqlerrm <> 'PERSON_IS_PERSONNEL' then raise; end if; end;
    begin perform private.admin_set_person_kind(v_s, 'support', ' '); raise exception 'selftest: empty reason';
    exception when others then if sqlerrm <> 'VALIDATION_FAILED' then raise; end if; end;
    perform private.admin_set_person_kind(v_s, 'support', 'selftest');
    if (select kind from public.people where id = v_s) <> 'support'
       or not exists (select 1 from private.security_audit where action = 'person_kind_set' and subject = v_s and detail ->> 'to' = 'support') then
      raise exception 'selftest: kind change'; end if;
    if private.person_shown('support') or not private.person_shown('personnel') then raise exception 'selftest: shown'; end if;
    begin perform public.list_private_people('outro'); raise exception 'selftest: purpose accepted';
    exception when others then if sqlerrm <> 'VALIDATION_FAILED' then raise; end if; end;
    raise exception 'selftest_ok';
  exception when others then
    if sqlerrm <> 'selftest_ok' then raise; end if;
  end;
end $$;
