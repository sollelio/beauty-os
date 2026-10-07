-- Slice 06 product decisions closed (Sollelio, 2026-10-07; 07 I1 partial, I2–I5):
--  · Reopen (B8, mandatory reason): Fechado → Em pagamento when the period has confirmed payments, otherwise
--    Pronto para pagamento. Approval, payments, decisions, close statements and history stay as recorded; the reopen
--    is its own traced transition. Closing again adds a new close statement (ADR-0007).
--  · Records after approval: once a period is Pronto para pagamento or Em pagamento, new services, advances,
--    expenses and purchases in it are rejected (PERIOD_APPROVED). To change those inputs, annul the approval first
--    (only possible before any payment). With payments, no correction exists yet: the rejection stands.
--  · Unchanged and now decided: partial payments (lower = Parcial, higher = blocked); period-level approval annulled
--    only before any payment; closing without an owners' decision warns and is recorded.

-- Earlier-slice records: closed → PERIOD_CLOSED (unchanged); approved → PERIOD_APPROVED.
create or replace function private.touch_period_of_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_period uuid := private.period_for(new.organization_id, new.occurred_at); v_state text;
begin
  if v_period is null then return null; end if;
  select state into v_state from public.periods where id = v_period for update;
  if v_state = 'fechado' then raise exception 'PERIOD_CLOSED'; end if;
  if v_state in ('pronto_para_pagamento', 'em_pagamento') then raise exception 'PERIOD_APPROVED'; end if;
  perform private.touch_period(v_period);
  return null;
end $$;

-- Reabrir período (B8): the reviewed revision, a mandatory reason, the exact grant of a period.reopen holder.
create or replace function public.reopen_period(p_command_id uuid, p_grant_id uuid, p_period_id uuid, p_review_revision bigint, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_reason text := nullif(trim(coalesce(p_reason, '')), ''); v_fp text; v_r jsonb; v_actor uuid;
  v_p public.periods; v_a public.period_approvals; v_to text; v_rev bigint;
begin
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or p_period_id is null or p_review_revision is null or v_reason is null or char_length(v_reason) > 200 then
    raise exception 'VALIDATION_FAILED';
  end if;
  v_fp := md5(jsonb_build_object('period', p_period_id, 'revision', p_review_revision, 'reason', v_reason)::text);
  v_r := private.cmd_replay(p_command_id, 'reopen_period', v_fp); if v_r is not null then return v_r; end if;
  v_actor := private.consume_one_shot_grant(p_grant_id, 'period.reopen', p_command_id);
  v_p := private.lock_period(v_org, p_period_id);
  if v_p.state <> 'fechado' then raise exception 'PERIOD_STATE_INVALID'; end if;
  if v_p.review_revision <> p_review_revision then raise exception 'STALE_REVIEW'; end if;
  v_a := private.current_approval(p_period_id);
  v_to := case when exists (select 1 from public.payments y where y.approval_id = v_a.id) then 'em_pagamento' else 'pronto_para_pagamento' end;
  v_rev := private.set_period_state(v_p, v_to, v_actor, p_command_id, v_reason);
  return private.cmd_done(p_command_id, 'reopen_period', v_fp, jsonb_build_object('state', v_to, 'reopened_by_person_id', v_actor, 'review_revision', v_rev));
end $$;

-- The review now also says when the period was last reopened, and how many close statements it has.
create or replace function private.last_reopen(p_period_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('at', t.at, 'by', p.display_name, 'reason', t.reason, 'to_state', t.to_state)
    from public.period_transitions t left join public.people p on p.id = t.actor_person_id
   where t.period_id = p_period_id and t.from_state = 'fechado' order by t.id desc limit 1
$$;
revoke all on function private.last_reopen(uuid) from public, anon, authenticated;

do $$
declare v_src text;
begin
  select pg_get_functiondef('public.fecho_period(uuid)'::regprocedure) into v_src;
  v_src := replace(v_src, $q$'closed', case when v_stmt.id is null$q$,
    $q$'reopened', case when v_period.state <> 'fechado' then private.last_reopen(v_period.id) end,
    'close_statements_count', (select count(*) from public.period_close_statements s where s.period_id = v_period.id),
    'closed', case when v_stmt.id is null$q$);
  if position('close_statements_count' in v_src) = 0 then raise exception 'fecho_period patch failed'; end if;
  execute v_src;

  select pg_get_functiondef('public.fecho_history(uuid)'::regprocedure) into v_src;
  v_src := replace(v_src, $q$  ) x), '[]'::jsonb);$q$,
    $q$    union all
    select jsonb_build_object('kind', 'reopen', 'at', t.at, 'by', b.display_name, 'reason', t.reason, 'to_state', t.to_state)
      from public.period_transitions t join public.people b on b.id = t.actor_person_id where t.period_id = v_period.id and t.from_state = 'fechado'
  ) x), '[]'::jsonb);$q$);
  if position('''reopen''' in v_src) = 0 then raise exception 'fecho_history patch failed'; end if;
  execute v_src;
end $$;

-- Confirmer list: include the reopen boundary.
create or replace function public.list_confirmers(p_permission text default 'movement.confirm')
returns table (id uuid, display_name text) language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name from public.people p
    join private.person_permissions pp on pp.person_id = p.id and pp.permission = p_permission
    join private.person_secrets s on s.person_id = p.id
   where p.organization_id = (select private.current_org_id()) and p.active
     and p_permission in ('movement.confirm', 'period.decide', 'payment.confirm', 'period.close', 'period.reopen')
   order by p.display_name
$$;

revoke all on function public.reopen_period(uuid, uuid, uuid, bigint, text) from public, anon;
grant execute on function public.reopen_period(uuid, uuid, uuid, bigint, text) to authenticated;
