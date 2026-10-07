-- Slice 03 · module `money`: operating expenses (04 J3). A reserve allocation is not an expense (04 J3 `Decided`).
-- Business-financial data: no browser role reads or writes these tables directly (Dinheiro is a later slice).
-- When the `period` module exists, `record_expense` must also change the period review revision (ADR-0005 R-1).

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  label text not null,
  hint text,
  sort_order smallint not null default 0,
  active boolean not null default true,
  unique (organization_id, id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  category_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  payment_kind text not null check (payment_kind in ('single', 'mixed')),
  note text check (note is null or char_length(note) <= 60),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  device_id uuid not null,
  declared_operator_id uuid,
  confirmed_by_person_id uuid not null,
  command_id uuid not null unique,
  unique (organization_id, id),
  foreign key (organization_id, category_id) references public.expense_categories(organization_id, id),
  foreign key (organization_id, declared_operator_id) references public.people(organization_id, id),
  foreign key (organization_id, confirmed_by_person_id) references public.people(organization_id, id)
);
create index on public.expenses (organization_id, occurred_at desc);

create table public.expense_payments (
  expense_id uuid not null,
  organization_id uuid not null,
  payment_method_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  primary key (expense_id, payment_method_id),
  foreign key (organization_id, expense_id) references public.expenses(organization_id, id),
  foreign key (organization_id, payment_method_id) references public.payment_methods(organization_id, id)
);

alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_payments enable row level security;
revoke all on public.expense_categories, public.expenses, public.expense_payments from anon, authenticated;
grant select on public.expense_categories to authenticated;                    -- operational list for capture
create policy expense_categories_read_own on public.expense_categories for select to authenticated
  using (organization_id = (select private.current_org_id()));
-- expenses / expense_payments: no grants, no policies.

-- p_payments: [{"method_id": uuid, "amount_minor": int}] — one part, or two parts (Misto) that add up to the amount.
create or replace function public.record_expense(
  p_command_id uuid,
  p_grant_id uuid,
  p_category_id uuid,
  p_amount_minor bigint,
  p_payments jsonb,
  p_note text default null,
  p_declared_operator_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_device uuid; v_org uuid; v_uid uuid := auth.uid(); v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_parts jsonb; v_count int; v_sum bigint; v_fp text; v_journal private.command_journal;
  v_confirmer uuid; v_id uuid; v_now timestamptz := now(); v_result jsonb;
begin
  select cd.device_id, cd.organization_id into v_device, v_org from private.current_device() cd;
  if v_org is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_command_id is null or p_category_id is null or p_amount_minor is null
     or p_payments is null or jsonb_typeof(p_payments) <> 'array' then
    raise exception 'VALIDATION_FAILED';
  end if;

  select jsonb_agg(jsonb_build_object('method_id', (e ->> 'method_id')::uuid, 'amount_minor', (e ->> 'amount_minor')::bigint)
                   order by e ->> 'method_id'),
         count(*), sum((e ->> 'amount_minor')::bigint)
    into v_parts, v_count, v_sum
    from jsonb_array_elements(p_payments) e;

  v_fp := md5(jsonb_build_object('type', 'record_expense', 'category', p_category_id, 'amount', p_amount_minor,
                                 'payments', v_parts, 'note', v_note, 'declared', p_declared_operator_id)::text);

  perform pg_advisory_xact_lock(hashtextextended('cmd:' || p_command_id::text, 0));
  select * into v_journal from private.command_journal where command_id = p_command_id;
  if found then
    if v_journal.organization_id = v_org and v_journal.principal = v_uid
       and v_journal.command_type = 'record_expense' and v_journal.fingerprint = v_fp then
      return v_journal.result || jsonb_build_object('replayed', true);
    end if;
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;

  if not exists (select 1 from public.expense_categories c where c.id = p_category_id and c.organization_id = v_org and c.active)
     or (p_declared_operator_id is not null
         and not exists (select 1 from public.people p where p.id = p_declared_operator_id and p.organization_id = v_org and p.active))
     or exists (select 1 from jsonb_array_elements(v_parts) e
                 where not exists (select 1 from public.payment_methods m
                                    where m.id = (e ->> 'method_id')::uuid and m.organization_id = v_org and m.active)) then
    raise exception 'CROSS_TENANT_REFERENCE';
  end if;

  if p_amount_minor <= 0 or v_count not in (1, 2) or char_length(coalesce(v_note, '')) > 60
     or exists (select 1 from jsonb_array_elements(v_parts) e where (e ->> 'amount_minor')::bigint is null or (e ->> 'amount_minor')::bigint <= 0)
     or (v_count = 2 and (select count(distinct e ->> 'method_id') from jsonb_array_elements(v_parts) e) <> 2) then
    raise exception 'VALIDATION_FAILED';
  end if;
  if v_sum <> p_amount_minor then raise exception 'MIXED_PAYMENT_MISMATCH'; end if;

  v_confirmer := private.consume_one_shot_grant(p_grant_id, 'movement.confirm', p_command_id);

  insert into public.expenses (organization_id, category_id, amount_minor, payment_kind, note, occurred_at, recorded_at,
                               device_id, declared_operator_id, confirmed_by_person_id, command_id)
  values (v_org, p_category_id, p_amount_minor, case when v_count = 2 then 'mixed' else 'single' end, v_note, v_now, v_now,
          v_device, p_declared_operator_id, v_confirmer, p_command_id)
  returning id into v_id;

  insert into public.expense_payments (expense_id, organization_id, payment_method_id, amount_minor)
  select v_id, v_org, (e ->> 'method_id')::uuid, (e ->> 'amount_minor')::bigint from jsonb_array_elements(v_parts) e;

  v_result := jsonb_build_object('expense_id', v_id, 'occurred_at', v_now, 'confirmed_by_person_id', v_confirmer);
  insert into private.command_journal (command_id, organization_id, principal, command_type, fingerprint, result)
  values (p_command_id, v_org, v_uid, 'record_expense', v_fp, v_result);
  return v_result;
end $$;

revoke all on function public.record_expense(uuid, uuid, uuid, bigint, jsonb, text, uuid) from public, anon;
grant execute on function public.record_expense(uuid, uuid, uuid, bigint, jsonb, text, uuid) to authenticated;
