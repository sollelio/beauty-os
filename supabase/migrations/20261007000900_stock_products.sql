-- Slice 03 · module `stock`: product identity only (name + unit word) so purchase lines can reference products.
-- No stock state, levels, reserve units or lists yet (Slice 05). A purchase never changes stock state (Slice 05).

create table public.unit_words (
  organization_id uuid not null references public.organizations(id),
  word text not null,                                -- a word on the product, not a system of measures (Slice 03 §3)
  sort_order smallint not null default 0,
  primary key (organization_id, word)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (char_length(trim(name)) between 2 and 80),
  unit_word text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, unit_word) references public.unit_words(organization_id, word)
);
create unique index products_org_name_key on public.products (organization_id, lower(trim(name)));

alter table public.unit_words enable row level security;
alter table public.products enable row level security;
revoke all on public.unit_words, public.products from anon, authenticated;
grant select on public.unit_words, public.products to authenticated;           -- operational-shared catalogue
create policy unit_words_read_own on public.unit_words for select to authenticated
  using (organization_id = (select private.current_org_id()));
create policy products_read_own on public.products for select to authenticated
  using (organization_id = (select private.current_org_id()));
