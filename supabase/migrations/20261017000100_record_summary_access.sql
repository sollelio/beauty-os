-- S3a · record_summary least privilege (pre-S3 security review, 2026-10-17).
-- public.record_summary returned any record of the device's organization to any bound device, without a PIN: with a
-- known id — a correction link left in a shared phone's browser history (/registos/anular/<kind>/<id>) — the next
-- holder could read a colleague's advance, an expense or purchase total and a cancellation's reason and author
-- (Architecture Definition §8: personal- and business-financial classes; 07 §8 B3–B4).
-- A summary is now returned only to:
--   · the device that recorded the record, for 30 minutes after its server write time (recorded_at — never the captured
--     occurred_at, so a delayed offline capture opens its window when it reaches the server; a replay changes nothing):
--     the «Corrigir este registo» link of each capture's success screen (Slices 01–03);
--   · a verified private context (ADR-0009) of an active person holding team.finance.read — the permission that already
--     gates every screen listing these records one by one: Situação's manager view (services, advances), Fecho ·
--     Dinheiro (expenses, purchases; private.require_finance_viewer) and the Fecho history, whose cancellation entries
--     call this function (unchanged: it requires the same permission).
-- records.correct alone opens no summary: it authorizes the cancel command (07 D8, B9), not reading private records;
-- cancel_record is unchanged. A person's own records in their own private context are not added: no screen needs it and
-- the B3 view shows no cancellation details today.
-- Anything else — another device, a lapsed window, a private context without the permission, another organization's
-- record, an unknown id or kind — gets the same CROSS_TENANT_REFERENCE as before, so a known id reveals nothing. An
-- unbound principal stays NOT_AUTHORIZED. Signature, grants and response shape are unchanged.

-- The access decision, with every input explicit (organization, devices, viewer, time) so it is testable on its own.
create or replace function private.record_summary_allowed(p_org uuid, p_record_device uuid, p_recorded_at timestamptz,
                                                          p_device uuid, p_viewer uuid, p_now timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(p_device = p_record_device and p_recorded_at >= p_now - interval '30 minutes', false)
      or exists (select 1 from private.person_permissions pp
                   join public.people pe on pe.id = pp.person_id and pe.organization_id = pp.organization_id
                  where pp.person_id = p_viewer and pp.organization_id = p_org and pp.permission = 'team.finance.read'
                    and pe.active)
$$;
revoke all on function private.record_summary_allowed(uuid, uuid, timestamptz, uuid, uuid, timestamptz) from public, anon, authenticated;

-- What is being cancelled (shown before confirming; the same facts the capture success already showed).
create or replace function public.record_summary(p_kind text, p_record_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_device uuid; v_r jsonb; v_rec_device uuid; v_rec_at timestamptz;
begin
  select cd.device_id, cd.organization_id into v_device, v_org from private.current_device() cd;
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_kind = 'service' then
    select jsonb_build_object('occurred_at', r.occurred_at, 'amount_minor', r.value_minor, 'title', s.name, 'person', p.display_name),
           r.device_id, r.recorded_at into v_r, v_rec_device, v_rec_at
      from public.service_records r join public.services s on s.id = r.service_id join public.people p on p.id = r.person_id
     where r.id = p_record_id and r.organization_id = v_org;
  elsif p_kind = 'advance' then
    select jsonb_build_object('occurred_at', a.occurred_at, 'amount_minor', a.amount_minor, 'title', 'Adiantamento', 'person', p.display_name),
           a.device_id, a.recorded_at into v_r, v_rec_device, v_rec_at
      from public.advances a join public.people p on p.id = a.person_id where a.id = p_record_id and a.organization_id = v_org;
  elsif p_kind = 'expense' then
    select jsonb_build_object('occurred_at', e.occurred_at, 'amount_minor', e.amount_minor, 'title', c.label, 'person', null),
           e.device_id, e.recorded_at into v_r, v_rec_device, v_rec_at
      from public.expenses e join public.expense_categories c on c.id = e.category_id where e.id = p_record_id and e.organization_id = v_org;
  elsif p_kind = 'purchase' then
    select jsonb_build_object('occurred_at', pu.occurred_at, 'amount_minor', pu.total_minor,
             'title', 'Compra' || coalesce(' · ' || o.label, ''), 'person', null,
             'line_count', (select count(*) from public.purchase_lines l where l.purchase_id = pu.id)),
           pu.device_id, pu.recorded_at into v_r, v_rec_device, v_rec_at
      from public.purchases pu left join public.purchase_origins o on o.id = pu.origin_id where pu.id = p_record_id and pu.organization_id = v_org;
  end if;
  -- one answer for "no such record here" and "not yours to read"
  if v_r is null or not private.record_summary_allowed(v_org, v_rec_device, v_rec_at, v_device, private.current_private_person(), now()) then
    raise exception 'CROSS_TENANT_REFERENCE';
  end if;
  return v_r || jsonb_build_object('kind', p_kind,
    'cancelled', (select jsonb_build_object('at', c.cancelled_at, 'reason', c.reason, 'by', p.display_name)
                    from public.record_cancellations c join public.people p on p.id = c.cancelled_by_person_id
                   where c.record_id = p_record_id and c.organization_id = v_org));
end $$;
revoke all on function public.record_summary(text, uuid) from public, anon;
grant execute on function public.record_summary(text, uuid) to authenticated;

-- Self-test: the window (inclusive at exactly 30 minutes, closed one microsecond later), the recording device only, and
-- the private path (team.finance.read of an active person of the same organization; records.correct alone is not
-- enough). Runs on throwaway organizations and rolls everything back.
do $$
declare v_org uuid := gen_random_uuid(); v_org2 uuid := gen_random_uuid(); v_now timestamptz := now();
  v_dev uuid := gen_random_uuid(); v_dev2 uuid := gen_random_uuid();
  v_fin uuid := gen_random_uuid(); v_cor uuid := gen_random_uuid(); v_off uuid := gen_random_uuid(); v_fin2 uuid := gen_random_uuid();
begin
  begin
    insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol)
      values (v_org, 'selftest', 'UTC', 'XXX', 2, 'X'), (v_org2, 'selftest 2', 'UTC', 'XXX', 2, 'X');
    insert into public.people (id, organization_id, display_name, active) values
      (v_fin, v_org, 'selftest finance', true), (v_cor, v_org, 'selftest correct', true),
      (v_off, v_org, 'selftest inactive', false), (v_fin2, v_org2, 'selftest finance 2', true);
    insert into private.person_permissions (organization_id, person_id, permission) values
      (v_org, v_fin, 'team.finance.read'), (v_org, v_cor, 'records.correct'), (v_org, v_cor, 'movement.confirm'),
      (v_org, v_off, 'team.finance.read'), (v_org2, v_fin2, 'team.finance.read');

    -- the recording device, no private context
    if not private.record_summary_allowed(v_org, v_dev, v_now, v_dev, null, v_now) then raise exception 'selftest: just recorded'; end if;
    if not private.record_summary_allowed(v_org, v_dev, v_now - interval '29 minutes 59 seconds', v_dev, null, v_now) then raise exception 'selftest: 29:59'; end if;
    if not private.record_summary_allowed(v_org, v_dev, v_now - interval '30 minutes', v_dev, null, v_now) then raise exception 'selftest: 30:00'; end if;
    if private.record_summary_allowed(v_org, v_dev, v_now - interval '30 minutes 1 microsecond', v_dev, null, v_now) then raise exception 'selftest: 30:00.000001'; end if;
    if private.record_summary_allowed(v_org, v_dev, v_now - interval '2 hours', v_dev, null, v_now) then raise exception 'selftest: lapsed'; end if;
    -- another device, or no device on either side
    if private.record_summary_allowed(v_org, v_dev, v_now, v_dev2, null, v_now) then raise exception 'selftest: other device'; end if;
    if private.record_summary_allowed(v_org, v_dev, v_now, null, null, v_now) then raise exception 'selftest: no device'; end if;
    if private.record_summary_allowed(v_org, null, v_now, v_dev, null, v_now) then raise exception 'selftest: no record device'; end if;
    -- a private context on another device, long after the window
    if not private.record_summary_allowed(v_org, v_dev, v_now - interval '1 year', v_dev2, v_fin, v_now) then raise exception 'selftest: finance viewer'; end if;
    if private.record_summary_allowed(v_org, v_dev, v_now - interval '1 year', v_dev2, v_cor, v_now) then raise exception 'selftest: records.correct alone'; end if;
    if private.record_summary_allowed(v_org, v_dev, v_now - interval '1 year', v_dev2, v_off, v_now) then raise exception 'selftest: inactive viewer'; end if;
    if private.record_summary_allowed(v_org, v_dev, v_now - interval '1 year', v_dev2, v_fin2, v_now) then raise exception 'selftest: other organization viewer'; end if;
    if private.record_summary_allowed(v_org, v_dev, v_now - interval '1 year', v_dev2, gen_random_uuid(), v_now) then raise exception 'selftest: unknown viewer'; end if;
    raise exception 'selftest_ok';
  exception when others then
    if sqlerrm <> 'selftest_ok' then raise; end if;
  end;
end $$;
