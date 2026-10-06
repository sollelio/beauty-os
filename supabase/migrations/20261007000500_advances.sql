-- Slice 02 · module `team`: personal advances (01 §2, 04 J2). Not an expense, not a loan.
-- Personal-financial data: no browser role can read or write this table directly. Readers arrive with the
-- professional situation (Slice 04). Note: when the `period` module exists, `record_advance` must also change the
-- period review revision in the same transaction (ADR-0005 R-1).

create table public.advances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  person_id uuid not null,                           -- recipient
  amount_minor bigint not null check (amount_minor > 0),
  payment_method_id uuid not null,
  note text check (note is null or char_length(note) <= 60),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  device_id uuid not null,
  declared_operator_id uuid,                         -- unverified, if the client supplies one
  confirmed_by_person_id uuid not null,              -- verified actor (ADR-0009)
  command_id uuid not null unique,
  foreign key (organization_id, person_id) references public.people(organization_id, id),
  foreign key (organization_id, payment_method_id) references public.payment_methods(organization_id, id),
  foreign key (organization_id, declared_operator_id) references public.people(organization_id, id),
  foreign key (organization_id, confirmed_by_person_id) references public.people(organization_id, id)
);
create index on public.advances (organization_id, person_id, occurred_at desc);

alter table public.advances enable row level security;
revoke all on public.advances from anon, authenticated;   -- no policies, no grants: no direct read or DML

create or replace function public.record_advance(
  p_command_id uuid,
  p_person_id uuid,
  p_amount_minor bigint,
  p_payment_method_id uuid,
  p_note text default null,
  p_declared_operator_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_device uuid; v_org uuid; v_uid uuid := auth.uid(); v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_fp text; v_journal private.command_journal; v_confirmer uuid; v_id uuid; v_now timestamptz := now(); v_result jsonb;
begin
  select cd.device_id, cd.organization_id into v_device, v_org from private.current_device() cd;
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or p_person_id is null or p_amount_minor is null or p_payment_method_id is null then
    raise exception 'VALIDATION_FAILED';
  end if;

  v_fp := md5(jsonb_build_object('type', 'record_advance', 'person', p_person_id, 'amount', p_amount_minor,
                                 'method', p_payment_method_id, 'note', v_note, 'declared', p_declared_operator_id)::text);

  -- idempotency first: a replay returns the original outcome without needing a fresh verification (ADR-0009 mitigation 10)
  perform pg_advisory_xact_lock(hashtextextended('cmd:' || p_command_id::text, 0));
  select * into v_journal from private.command_journal where command_id = p_command_id;
  if found then
    if v_journal.organization_id = v_org and v_journal.principal = v_uid
       and v_journal.command_type = 'record_advance' and v_journal.fingerprint = v_fp then
      return v_journal.result || jsonb_build_object('replayed', true);
    end if;
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;

  if not exists (select 1 from public.people p where p.id = p_person_id and p.organization_id = v_org and p.active)
     or not exists (select 1 from public.payment_methods m where m.id = p_payment_method_id and m.organization_id = v_org and m.active)
     or (p_declared_operator_id is not null
         and not exists (select 1 from public.people p where p.id = p_declared_operator_id and p.organization_id = v_org and p.active)) then
    raise exception 'CROSS_TENANT_REFERENCE';
  end if;
  if p_amount_minor <= 0 or char_length(coalesce(v_note, '')) > 60 then raise exception 'VALIDATION_FAILED'; end if;

  -- sensitive action: a verified person holding the confirm permission (boundary B2), consumed once
  v_confirmer := private.take_one_shot_grant('movement.confirm', p_command_id);

  insert into public.advances (organization_id, person_id, amount_minor, payment_method_id, note, occurred_at, recorded_at,
                               device_id, declared_operator_id, confirmed_by_person_id, command_id)
  values (v_org, p_person_id, p_amount_minor, p_payment_method_id, v_note, v_now, v_now,
          v_device, p_declared_operator_id, v_confirmer, p_command_id)
  returning id into v_id;

  v_result := jsonb_build_object('advance_id', v_id, 'occurred_at', v_now, 'confirmed_by_person_id', v_confirmer);
  insert into private.command_journal (command_id, organization_id, principal, command_type, fingerprint, result)
  values (p_command_id, v_org, v_uid, 'record_advance', v_fp, v_result);
  return v_result;
end $$;

revoke all on function public.record_advance(uuid, uuid, bigint, uuid, text, uuid) from public, anon;
grant execute on function public.record_advance(uuid, uuid, bigint, uuid, text, uuid) to authenticated;
