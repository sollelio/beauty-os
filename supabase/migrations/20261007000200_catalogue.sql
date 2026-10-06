-- Slice 01 · module `catalogue`: services with default prices, per organization (03 §2 #2, no fixed categories).

create table public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  default_price_minor bigint not null check (default_price_minor >= 0),   -- minor units of the organization currency
  active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);
create index on public.services (organization_id);

alter table public.services enable row level security;
revoke all on public.services from anon, authenticated;
grant select on public.services to authenticated;
create policy services_read_own on public.services for select to authenticated
  using (organization_id = (select private.current_org_id()));
