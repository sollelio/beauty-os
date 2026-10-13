-- Salão Agradável · Production onboarding (DRAFT — prepared 2026-10-13, NOT APPLIED).
-- Plan, open decisions and provisional values: salao-agradavel-onboarding.md. Run only after explicit approval, in the
-- Supabase SQL editor of Beauty OS Prod (role postgres), after migration 20261013000100_catalogue_management is applied.
-- One transaction: it creates everything or nothing. It refuses to run twice or before the Gestão migration, and it
-- checks the counts (5 people, 22 services, 15 products, 8 periods, 11 permissions) before commit: any other count raises
-- and the transaction rolls back (the final commit of an aborted transaction is a rollback).
-- NOT in this file (never in the repository): PINs, enrollment codes. Not included until decided: reserve opening
-- balance, expense categories, ownership (see the plan, §6).
-- Provisional values (Sollelio, 2026-10-13; Fernando corrects them in Gestão): Secar cabelo 1.000 Kz, Pedicure completo
-- 1.500 Kz; units of Pacote de lima, Pacote de lixas, Autocolantes.
begin;
do $$
declare
  v_org uuid; v_fer uuid; v_fda uuid; v_lau uuid; v_pat uuid; v_mer uuid; v_week date; i int;
  n_people bigint; n_services bigint; n_products bigint; n_periods bigint; n_permissions bigint;
  c_start date := date '2026-10-12';                   -- DECISION (plan §6.3): first weekly period, Monday–Sunday
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261013000100') then
    raise exception 'apply migration 20261013000100_catalogue_management first';
  end if;
  if exists (select 1 from public.organizations where name = 'Salão Agradável') then raise exception 'Salão Agradável already exists'; end if;

  insert into public.organizations (name, timezone, currency_code, currency_exponent, currency_symbol)
  values ('Salão Agradável', 'Africa/Luanda', 'AOA', 2, 'Kz') returning id into v_org;

  insert into public.payment_methods (organization_id, code, label, sort_order) values
    (v_org, 'dinheiro', 'Dinheiro', 1), (v_org, 'multicaixa_express', 'Multicaixa Express', 2);

  -- people (display names as the salon uses them; Duart is not onboarded)
  insert into public.people (organization_id, display_name) values (v_org, 'Fernando') returning id into v_fer;
  insert into public.people (organization_id, display_name) values (v_org, 'Fernanda') returning id into v_fda;
  insert into public.people (organization_id, display_name) values (v_org, 'Laurindo') returning id into v_lau;
  insert into public.people (organization_id, display_name) values (v_org, 'Patrícia') returning id into v_pat;
  insert into public.people (organization_id, display_name) values (v_org, 'Merce') returning id into v_mer;   -- Marcelina; the salon calls her Merce

  -- service capabilities (labels; capture lists only people with at least one; Merce performs no services)
  insert into public.person_capabilities (organization_id, person_id, label, sort_order)
  select v_org, x.p, x.label, x.n from (values
    (v_fer, 'Unhas', 1), (v_fer, 'Lavagem', 2), (v_fer, 'Esticar', 3), (v_fer, 'Secar', 4), (v_fer, 'Brexe', 5), (v_fer, 'Ativar cachos', 6),
    (v_fda, 'Cabeleireira', 1), (v_fda, 'Unhas', 2),                         -- performs every salon service
    (v_lau, 'Unhas', 1),
    (v_pat, 'Unhas', 1), (v_pat, 'Tranças', 2), (v_pat, 'Puxinhos de gel', 3), (v_pat, 'Secar', 4), (v_pat, 'Brexe', 5), (v_pat, 'Ativar cachos', 6)
  ) x(p, label, n);

  -- services (current prices in minor units: Kz × 100); sort order groups hair · nails · other
  insert into public.services (organization_id, name, default_price_minor, sort_order)
  select v_org, x.name, x.kz * 100, x.n from (values
    ('Desfliso', 6000, 1), ('Brexe', 2000, 2), ('Brexe com lavagem', 3000, 3), ('Tranças', 5000, 4), ('Lavagem de cabelo', 1000, 5),
    ('Lavagem e esticar', 1500, 6), ('Secar cabelo', 1000, 7) /* PROVISIONAL */, ('Puxinho de gel', 2000, 8), ('Puxinho trabalhado', 3000, 9),
    ('Colagem de peruca', 6000, 10), ('Lavagem de peruca', 1000, 11), ('Lavagem de peruca com brexe', 2000, 12), ('Ativar cachos', 3000, 13),
    ('Pedicure completo', 1500, 14) /* PROVISIONAL */, ('Unhas do pé', 700, 15), ('Unhas da mão', 700, 16), ('Aplicação de unhas', 1300, 17),
    ('Aplicação de unhas de gel', 2000, 18), ('Porcelana', 3500, 19),
    ('Aplicação de pestanas', 1000, 20), ('Tatuagem de sobrancelhas', 500, 21), ('Acertar sobrancelhas', 300, 22)
  ) x(name, kz, n);

  -- products: unit word (Stock Lite: no quantities), purpose, reference price (information only)
  insert into public.unit_words (organization_id, word, sort_order) values
    (v_org, 'garrafão 5 L', 1), (v_org, 'embalagem', 2), (v_org, 'frasco', 3), (v_org, 'pacote', 4);
  insert into public.products (organization_id, name, unit_word, purpose, reference_price_minor)
  select v_org, x.name, x.unit, x.purpose, x.kz * 100 from (values
    ('Amaciador', 'garrafão 5 L', 'Cabelo', 8000), ('Shampoo', 'garrafão 5 L', 'Cabelo', 8000), ('Gel', 'embalagem', 'Cabelo', 7000),
    ('Brilho', 'embalagem', 'Cabelo', 2000), ('Óleo de cabelo', 'embalagem', 'Cabelo', 1500), ('Óleo perfumado', 'embalagem', 'Cabelo', 2000),
    ('Ativador de cachos', 'embalagem', 'Cabelo', 2000), ('Condicionador de cachos', 'embalagem', 'Cabelo', 1500), ('Cola de perucas', 'embalagem', 'Cabelo', 8000),
    ('Pacote de unhas', 'pacote', 'Unhas', 3000), ('Cola de unhas', 'frasco', 'Unhas', 1000), ('Verniz', 'frasco', 'Unhas', 1500),
    ('Pacote de lima', 'pacote', 'Unhas', 1700) /* unit PROVISIONAL */, ('Pacote de lixas', 'pacote', 'Unhas', 2500) /* unit PROVISIONAL */,
    ('Autocolantes', 'pacote', 'Unhas', 1000) /* unit PROVISIONAL (pacote/conjunto) */
  ) x(name, unit, purpose, kz);

  insert into public.purchase_origins (organization_id, label, sort_order) values (v_org, 'Mercado do Kikolo', 1);

  -- standing rules (share of every service the person performs), effective from the first period, set by Fernando
  perform private.admin_set_rule(v_fer, 'standing', 70, c_start, v_fer);
  perform private.admin_set_rule(v_fda, 'standing', 60, c_start, v_fer);
  perform private.admin_set_rule(v_lau, 'standing', 50, c_start, v_fer);
  perform private.admin_set_rule(v_pat, 'standing', 50, c_start, v_fer);
  -- Merce: no service rule (variable monthly salary, decided by Fernando and Merce; plan §6.4)

  -- permissions (Sollelio, 2026-10-13; plan §4). Fernanda, Laurindo, Patrícia: none (own situation with their PIN).
  perform private.admin_set_permission(v_fer, x, true) from unnest(array['catalogue.manage', 'movement.confirm', 'team.finance.read',
    'business.health.read', 'period.decide', 'period.close', 'period.reopen', 'records.correct']) x;
  perform private.admin_set_permission(v_mer, x, true) from unnest(array['team.finance.read', 'business.health.read', 'payment.confirm']) x;

  -- weekly periods: 8 weeks ahead (create more before they start; runbook §2)
  for i in 0..7 loop
    v_week := c_start + i * 7;
    perform private.admin_create_period(v_org, 'Semana ' || to_char(v_week, 'DD/MM') || '–' || to_char(v_week + 6, 'DD/MM'), v_week, v_week + 6);
  end loop;

  -- Enforced before commit: any other count raises, the transaction is aborted and nothing is created.
  select (select count(*) from public.people where organization_id = v_org),
         (select count(*) from public.services where organization_id = v_org),
         (select count(*) from public.products where organization_id = v_org),
         (select count(*) from public.periods where organization_id = v_org),
         (select count(*) from private.person_permissions where organization_id = v_org)
    into n_people, n_services, n_products, n_periods, n_permissions;
  if (n_people, n_services, n_products, n_periods, n_permissions) is distinct from (5::bigint, 22::bigint, 15::bigint, 8::bigint, 11::bigint) then
    raise exception 'onboarding counts wrong (expected 5/22/15/8/11): people %, services %, products %, periods %, permissions %',
      n_people, n_services, n_products, n_periods, n_permissions;
  end if;

  raise notice 'Salão Agradável created: organization %', v_org;
end $$;

-- Read-out only (already enforced above): what was created.
select (select count(*) from public.people p join public.organizations o on o.id = p.organization_id where o.name = 'Salão Agradável') as people,          -- 5
       (select count(*) from public.services s join public.organizations o on o.id = s.organization_id where o.name = 'Salão Agradável') as services,    -- 22
       (select count(*) from public.products s join public.organizations o on o.id = s.organization_id where o.name = 'Salão Agradável') as products,    -- 15
       (select count(*) from public.periods s join public.organizations o on o.id = s.organization_id where o.name = 'Salão Agradável') as periods;      -- 8
select p.display_name, pp.permission from private.person_permissions pp join public.people p on p.id = pp.person_id
  join public.organizations o on o.id = p.organization_id where o.name = 'Salão Agradável' order by 1, 2;                                              -- 11 rows
commit;
