-- Slice 01 · module `org`: tenancy, people, payment methods, shared-device principal (ADR-0002, ADR-0009).
-- Browser roles never write these tables directly; devices bind through `redeem_enrollment`.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;                 -- not exposed through the Data API
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;      -- so RLS policies can call the actor helpers

-- New objects in public are not readable/executable by API roles unless granted explicitly below.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------- organizations ----------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null,                            -- organization setting (Architecture Definition D-7)
  currency_code text not null,                       -- organization setting, never hard-coded (00 §4)
  currency_exponent smallint not null check (currency_exponent between 0 and 4),
  currency_symbol text not null,
  created_at timestamptz not null default now()
);

-- ---------- people (independent dimensions, 00 §5; Slice 01 needs only name + service capability) ----------
create table public.people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);
create index on public.people (organization_id);

create table public.person_capabilities (
  organization_id uuid not null,
  person_id uuid not null,
  label text not null,                               -- free organization wording, no fixed categories
  sort_order smallint not null default 0,
  primary key (person_id, label),
  foreign key (organization_id, person_id) references public.people(organization_id, id)
);
create index on public.person_capabilities (organization_id);

-- ---------- payment methods (organization-configurable list, 07 §10.7) ----------
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text not null,
  label text not null,
  sort_order smallint not null default 0,
  active boolean not null default true,
  unique (organization_id, code),
  unique (organization_id, id)
);

-- ---------- shared-device principal (ADR-0009) ----------
create table private.devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  auth_user_id uuid not null unique,                 -- the anonymous Supabase user of the device
  label text,
  enrolled_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index on private.devices (organization_id);

create table private.enrollment_codes (
  code_hash text primary key,                        -- sha256 of the code; plaintext is never stored
  organization_id uuid not null references public.organizations(id),
  label text not null,
  expires_at timestamptz not null,
  max_uses int not null check (max_uses > 0),
  use_count int not null default 0,
  revoked_at timestamptz
);

-- ---------- actor context (single source for policies and commands) ----------
-- Trusted only from the verified JWT (sub, session_id) and database state:
-- the Auth session row must exist and the device binding must not be revoked.
create or replace function private.current_device()
returns table (device_id uuid, organization_id uuid)
language sql stable security definer set search_path = '' as $$
  select d.id, d.organization_id
  from private.devices d
  where d.auth_user_id = auth.uid()
    and d.revoked_at is null
    and exists (
      select 1 from auth.sessions s
      where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
        and s.user_id = auth.uid()
    )
$$;

create or replace function private.current_org_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select organization_id from private.current_device()
$$;

revoke all on function private.current_device() from public, anon;
revoke all on function private.current_org_id() from public, anon;
grant execute on function private.current_device() to authenticated;
grant execute on function private.current_org_id() to authenticated;

-- ---------- RLS: operational-shared reads, own organization only ----------
alter table public.organizations enable row level security;
alter table public.people enable row level security;
alter table public.person_capabilities enable row level security;
alter table public.payment_methods enable row level security;

revoke all on public.organizations, public.people, public.person_capabilities, public.payment_methods from anon, authenticated;
grant select on public.organizations, public.people, public.person_capabilities, public.payment_methods to authenticated;

create policy organizations_read_own on public.organizations for select to authenticated
  using (id = (select private.current_org_id()));
create policy people_read_own on public.people for select to authenticated
  using (organization_id = (select private.current_org_id()));
create policy person_capabilities_read_own on public.person_capabilities for select to authenticated
  using (organization_id = (select private.current_org_id()));
create policy payment_methods_read_own on public.payment_methods for select to authenticated
  using (organization_id = (select private.current_org_id()));

-- ---------- commands / reads ----------
create or replace function public.redeem_enrollment(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c private.enrollment_codes;
  uid uuid := auth.uid();
  sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  if uid is null or not exists (select 1 from auth.sessions s where s.id = sid and s.user_id = uid) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if exists (select 1 from private.devices d where d.auth_user_id = uid) then
    raise exception 'ALREADY_BOUND';
  end if;
  select * into c from private.enrollment_codes
   where code_hash = encode(extensions.digest(upper(trim(coalesce(p_code, ''))), 'sha256'), 'hex')
   for update;
  if c.code_hash is null or c.revoked_at is not null or c.expires_at < now() or c.use_count >= c.max_uses then
    raise exception 'ENROLLMENT_INVALID';
  end if;
  update private.enrollment_codes set use_count = use_count + 1 where code_hash = c.code_hash;
  insert into private.devices (organization_id, auth_user_id, label) values (c.organization_id, uid, c.label);
  return jsonb_build_object('ok', true);
end $$;

-- Device context for the app shell: whether this device is bound, and its organization's display settings.
create or replace function public.device_context()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object(
       'bound', true,
       'organization', jsonb_build_object(
         'id', o.id, 'name', o.name, 'timezone', o.timezone,
         'currency_code', o.currency_code, 'currency_exponent', o.currency_exponent, 'currency_symbol', o.currency_symbol))
     from private.current_device() cd join public.organizations o on o.id = cd.organization_id),
    jsonb_build_object('bound', false))
$$;

revoke all on function public.redeem_enrollment(text), public.device_context() from public, anon;
grant execute on function public.redeem_enrollment(text), public.device_context() to authenticated;
