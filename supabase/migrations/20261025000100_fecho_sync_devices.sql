-- Offline 7 follow-up · Fecho sync status per device: which phone blocks a period, why, and what to do on it.
-- The same three states as private.period_device_sync (ready / pending / silent), per device and with the same
-- predicates, for the team-finance holder who already reads the counts (public.fecho_sync_status). Read-only.
-- Unchanged: private.period_device_sync, private.require_period_sync_safe, approve_period and close_period — the block
-- (PERIOD_OFFLINE_SYNC_PENDING), its predicates and the absence of any override stay exactly as they are.
-- Per device, only: the label given at enrollment, when it was connected, its last check-in, whether it is the calling
-- device, and its counts for this period's days plus its undated ones. Never device ids, Auth users or other days.

create or replace function private.period_device_sync_detail(p_org uuid, p_period public.periods)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_end timestamptz; v_me uuid; v_out jsonb := '[]'::jsonb; d record;
  v_services int; v_drafts int; v_conflicts int; v_in_period boolean; v_undated int; v_state text;
begin
  select ((p_period.ends_on + 1)::timestamp at time zone o.timezone) into v_end from public.organizations o where o.id = p_org;
  select cd.device_id into v_me from private.current_device() cd;
  for d in
    select v.id, v.label, v.enrolled_at, r.reported_at, r.days, r.undated
      from private.devices v left join private.device_sync_reports r on r.device_id = v.id
     where v.organization_id = p_org and v.revoked_at is null and v.offline_capable_at is not null
     order by v.label nulls last, v.enrolled_at
  loop
    select coalesce(sum(private.sync_count(e, 'services')), 0), coalesce(sum(private.sync_count(e, 'drafts')), 0),
           coalesce(sum(private.sync_count(e, 'conflicts')), 0), count(*) > 0
      into v_services, v_drafts, v_conflicts, v_in_period
      from jsonb_array_elements(coalesce(d.days, '[]'::jsonb)) e
     where (e ->> 'day')::date between p_period.starts_on and p_period.ends_on;
    v_undated := private.sync_count(d.undated, 'services') + private.sync_count(d.undated, 'drafts') + private.sync_count(d.undated, 'conflicts');
    -- exactly the order and predicates of private.period_device_sync
    if d.reported_at is null or d.reported_at <= v_end then v_state := 'silent';
    elsif v_undated > 0 or v_in_period then v_state := 'pending';
    else v_state := 'ready';
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'label', d.label, 'enrolled_at', d.enrolled_at, 'reported_at', d.reported_at, 'this_device', d.id = v_me, 'state', v_state,
      'services', v_services + private.sync_count(d.undated, 'services'),
      'drafts', v_drafts + private.sync_count(d.undated, 'drafts'),
      'conflicts', v_conflicts + private.sync_count(d.undated, 'conflicts')));
  end loop;
  return v_out;
end $$;
revoke all on function private.period_device_sync_detail(uuid, public.periods) from public, anon, authenticated;

-- Fecho read: the counts as before, whether the period has ended, and the devices behind the counts.
create or replace function public.fecho_sync_status(p_period_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_p public.periods; v_sync jsonb;
begin
  perform private.require_finance_viewer();
  select * into v_p from public.periods where id = p_period_id and organization_id = v_org;
  if v_p.id is null then raise exception 'CROSS_TENANT_REFERENCE'; end if;
  v_sync := private.period_device_sync(v_org, v_p);
  return (v_sync - 'period_ends_at')
    || jsonb_build_object('period_ended', now() > (v_sync ->> 'period_ends_at')::timestamptz,
                          'devices', private.period_device_sync_detail(v_org, v_p));
end $$;
revoke all on function public.fecho_sync_status(uuid) from public, anon;
grant execute on function public.fecho_sync_status(uuid) to authenticated;
