-- Offline 7 (ADR-0010 §5): multi-device period sync safety.
-- Invariant: a period cannot be approved or closed until the server knows that every active offline-capable device is
-- synchronized for that period. A BLOCK, no override.
--  · A bound device becomes offline-capable with its first sync report (the app reports only once its Offline V1
--    runtime and device storage are working). Audited once.
--  · Each report replaces the device's previous one (the latest check-in counts): per day of the organization's time
--    zone, the device's unsent services, unconfirmed movement drafts and unresolved conflicts, plus the items it could
--    not date (they count against every period). The device and organization come from the session, never the report.
--  · A device is sync-safe for a period only with a report received after the period's end (organization time zone)
--    and nothing pending, unconfirmed or unresolved on the period's days nor undated. Revoked devices are not counted;
--    an abandoned device is revoked by the existing operator procedure (private.admin_revoke_device, runbook §3).
--  · approve_period / close_period check it after the review revision and before any effect; the rejection
--    (PERIOD_OFFLINE_SYNC_PENDING) rolls back the whole transaction, so the one-shot grant is not consumed.
-- Organizations without offline-capable devices behave exactly as before.

alter table private.devices add column offline_capable_at timestamptz;

create table private.device_sync_reports (
  device_id uuid primary key references private.devices(id),
  organization_id uuid not null references public.organizations(id),
  reported_at timestamptz not null,
  days jsonb not null,                         -- [{ day, services, drafts, conflicts }], non-zero days only
  undated jsonb not null                       -- { services, drafts, conflicts }
);
alter table private.device_sync_reports enable row level security;
revoke all on private.device_sync_reports from public, anon, authenticated;

-- A count as reported: a non-negative integer (bounded), anything else is refused.
create or replace function private.sync_count(p jsonb, p_key text)
returns int language plpgsql immutable security definer set search_path = '' as $$
declare v jsonb := p -> p_key;
begin
  if v is null then return 0; end if;
  if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric) or (v #>> '{}')::numeric not between 0 and 100000 then
    raise exception 'VALIDATION_FAILED';
  end if;
  return (v #>> '{}')::int;
end $$;
revoke all on function private.sync_count(jsonb, text) from public, anon, authenticated;

-- The current bound device reports its own local state (foreground, Offline 7).
create or replace function public.report_device_sync(p_report jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_device uuid; v_org uuid; v_days jsonb; v_undated jsonb; v_now timestamptz := now(); v_first boolean;
begin
  select cd.device_id, cd.organization_id into v_device, v_org from private.current_device() cd;
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_report is null or jsonb_typeof(p_report) <> 'object' or jsonb_typeof(coalesce(p_report -> 'days', '[]')) <> 'array'
     or jsonb_array_length(coalesce(p_report -> 'days', '[]')) > 400
     or (p_report ? 'undated' and jsonb_typeof(p_report -> 'undated') <> 'object') then
    raise exception 'VALIDATION_FAILED';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_report -> 'days', '[]')) e
              where jsonb_typeof(e) <> 'object' or (e ->> 'day') is null or (e ->> 'day') !~ '^\d{4}-\d{2}-\d{2}$') then
    raise exception 'VALIDATION_FAILED';
  end if;
  -- one row per day (summed), zero days dropped; an invalid date or count is refused
  select coalesce(jsonb_agg(jsonb_build_object('day', d, 'services', s, 'drafts', r, 'conflicts', c) order by d), '[]'::jsonb) into v_days
    from (select (e ->> 'day')::date::text d, sum(private.sync_count(e, 'services')) s, sum(private.sync_count(e, 'drafts')) r,
                 sum(private.sync_count(e, 'conflicts')) c
            from jsonb_array_elements(coalesce(p_report -> 'days', '[]')) e group by 1) x
   where s + r + c > 0;
  v_undated := jsonb_build_object('services', private.sync_count(coalesce(p_report -> 'undated', '{}'), 'services'),
                                  'drafts', private.sync_count(coalesce(p_report -> 'undated', '{}'), 'drafts'),
                                  'conflicts', private.sync_count(coalesce(p_report -> 'undated', '{}'), 'conflicts'));
  update private.devices set offline_capable_at = coalesce(offline_capable_at, v_now) where id = v_device
    returning offline_capable_at = v_now into v_first;
  if v_first then perform private.audit('device_offline_capable', v_org, v_device); end if;
  insert into private.device_sync_reports (device_id, organization_id, reported_at, days, undated)
  values (v_device, v_org, v_now, v_days, v_undated)
  on conflict (device_id) do update set reported_at = excluded.reported_at, days = excluded.days, undated = excluded.undated;
  return jsonb_build_object('reported_at', v_now);
end $$;
revoke all on function public.report_device_sync(jsonb) from public, anon;
grant execute on function public.report_device_sync(jsonb) to authenticated;

-- Per period: how many active offline-capable devices are ready, still have work for it, or have not checked in since
-- it ended. Counts only — no device identity leaves the database.
create or replace function private.period_device_sync(p_org uuid, p_period public.periods)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_end timestamptz; v_ready int := 0; v_pending int := 0; v_silent int := 0; d record;
begin
  select ((p_period.ends_on + 1)::timestamp at time zone o.timezone) into v_end from public.organizations o where o.id = p_org;
  for d in
    select r.reported_at, r.days, r.undated
      from private.devices v left join private.device_sync_reports r on r.device_id = v.id
     where v.organization_id = p_org and v.revoked_at is null and v.offline_capable_at is not null
  loop
    if d.reported_at is null or d.reported_at <= v_end then v_silent := v_silent + 1;
    elsif private.sync_count(d.undated, 'services') + private.sync_count(d.undated, 'drafts') + private.sync_count(d.undated, 'conflicts') > 0
       or exists (select 1 from jsonb_array_elements(d.days) e
                   where (e ->> 'day')::date between p_period.starts_on and p_period.ends_on) then v_pending := v_pending + 1;
    else v_ready := v_ready + 1;
    end if;
  end loop;
  return jsonb_build_object('ready', v_ready, 'pending', v_pending, 'silent', v_silent, 'safe', v_pending + v_silent = 0, 'period_ends_at', v_end);
end $$;
revoke all on function private.period_device_sync(uuid, public.periods) from public, anon, authenticated;

create or replace function private.require_period_sync_safe(p_org uuid, p_period public.periods)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.period_device_sync(p_org, p_period) ->> 'safe')::boolean then raise exception 'PERIOD_OFFLINE_SYNC_PENDING'; end if;
end $$;
revoke all on function private.require_period_sync_safe(uuid, public.periods) from public, anon, authenticated;

-- Fecho read (private context of a team-finance holder): the period's device sync state, live, counts only.
create or replace function public.fecho_sync_status(p_period_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_p public.periods;
begin
  perform private.require_finance_viewer();
  select * into v_p from public.periods where id = p_period_id and organization_id = v_org;
  if v_p.id is null then raise exception 'CROSS_TENANT_REFERENCE'; end if;
  return private.period_device_sync(v_org, v_p) - 'period_ends_at';
end $$;
revoke all on function public.fecho_sync_status(uuid) from public, anon;
grant execute on function public.fecho_sync_status(uuid) to authenticated;

-- The block in approve_period and close_period: after the review revision, before rules / payments and any effect.
do $$
declare f text; v_src text; v_new text;
  v_anchor text := $a$if v_p.review_revision <> p_review_revision then raise exception 'STALE_REVIEW'; end if;$a$;
begin
  foreach f in array array['public.approve_period(uuid, uuid, uuid, bigint)', 'public.close_period(uuid, uuid, uuid, bigint)'] loop
    v_src := pg_get_functiondef(f::regprocedure);
    if (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor) <> 1 then raise exception 'sync-safety patch: anchor not found once in %', f; end if;
    v_new := replace(v_src, v_anchor, v_anchor || E'\n  perform private.require_period_sync_safe(v_org, v_p);              -- ADR-0010 §5 (Offline 7)');
    execute v_new;
  end loop;
end $$;
