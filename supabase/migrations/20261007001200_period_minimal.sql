-- Slice 04 · module `period` (minimal): explicit periods with bounds and the four `Decided` states (03 §2), and the
-- payments table so the professional situation can show recorded payments (Slice 04 §3). Periods are explicit
-- entities, never derived from the calendar (07 §10.3). No transitions, approval, payment confirmation, close or
-- reopen here — those commands, the review revision and close statements belong to Slice 06 (ADR-0005, ADR-0007).
-- Personal/period financial data: no direct browser read or DML; reads go through actor-checked functions.

create table public.periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  label text not null,
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  state text not null default 'aberto'
    check (state in ('aberto', 'pronto_para_pagamento', 'em_pagamento', 'fechado')),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, starts_on)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  period_id uuid not null,
  person_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  payment_method_id uuid not null,
  paid_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  confirmed_by_person_id uuid not null,
  command_id uuid not null unique,
  foreign key (organization_id, period_id) references public.periods(organization_id, id),
  foreign key (organization_id, person_id) references public.people(organization_id, id),
  foreign key (organization_id, payment_method_id) references public.payment_methods(organization_id, id),
  foreign key (organization_id, confirmed_by_person_id) references public.people(organization_id, id)
);
create index on public.payments (organization_id, period_id, person_id);

alter table public.periods enable row level security;
alter table public.payments enable row level security;
revoke all on public.periods, public.payments from anon, authenticated;     -- no grants, no policies
