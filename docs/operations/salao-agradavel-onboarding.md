# Salão Agradável · Production onboarding plan (draft, 2026-10-13)

**Status: prepared, NOT applied.** Nothing below exists in Beauty OS Prod. The data comes from the Sollelio onboarding
brief of 2026-10-13 (pilot owner input). The SQL is [`salao-agradavel-onboarding.sql`](salao-agradavel-onboarding.sql)
(one transaction; refuses to run twice or before the Gestão migration). PINs and enrollment codes are never in the
repository.

## 1. Organization

| Item | Value | Target |
|---|---|---|
| Name | Salão Agradável | `organizations.name` |
| Country / timezone | Angola · `Africa/Luanda` | `organizations.timezone` |
| Currency | AOA · 2 minor digits · symbol `Kz` (amounts typed in whole Kz) | `organizations.currency_*` |
| Official period | Weekly, Monday → Sunday — **confirmed** (Sollelio, 2026-10-13); first period 12/10–18/10 (records start 14/10) | `admin_create_period` × 8 weeks (§5 step 3) |
| Customer payment methods | Dinheiro · Multicaixa Express | `payment_methods` (`dinheiro`, `multicaixa_express`) |
| Purchase origin | Mercado do Kikolo | `purchase_origins` |
| Reserve opening balance | 25.000 Kz | **not loadable as is** (§6.1) |
| Reserve rule | No fixed %; professionals paid first; expenses/purchases considered; owners decide what is distributed and retained | No configuration: this is how Fecho already works (allocation and owners' decision are per-period decisions, B5) |

## 2. People

| Person (display name) | Capabilities (labels) | Standing rule | Private access |
|---|---|---|---|
| Fernando — Gerente | Unhas · Lavagem · Esticar · Secar · Brexe · Ativar cachos | 70% | manager (§4) |
| Fernanda — Colaboradora | Cabeleireira · Unhas (all services) | 60% | own situation |
| Laurindo — mestre de unhas | Unhas | 50% | own situation |
| Patrícia | Unhas · Tranças · Puxinhos de gel · Secar · Brexe · Ativar cachos | 50% | own situation |
| Marcelina (display name Merce) — finanças / RH, remote | none (performs no services; not in capture) | none (§6.3) | finance read + payments (§4) |
| Duart | **not onboarded**, no access | — | — |
| Sollelio Support — **temporary** Sollelio support identity | none (performs no services) | none | every permission (§4) |

**Sollelio Support (temporary).** Until Sollelio Console exists, Sollelio needs its own audited identity inside Salão
Agradável to give support without using Fernando's (or anyone's) PIN and without acting as a member of the salon staff. It
is an ordinary person of this organization with its own PIN (chosen and held by Sollelio, never in the repository), under
the same person/PIN verification as everyone else: organization-scoped, no service role, no RLS bypass, no platform-level
access. Everything it confirms is attributed to "Sollelio Support". It has no capability and no rule, so it is not offered
in service capture, advances or the team list and is not counted in Fecho (the script refuses to commit otherwise). It
does appear wherever every active person or a permission holder is listed: the Área privada person list, the
*Confirmação necessária* picker of each permission, and the contributor list of a purchase. **It is to be replaced by the
future Sollelio Console / platform-support model**; it is not part of the salon's permission matrix (07 D8).

Rules: `admin_set_rule(person, 'standing', %, '2026-10-12', Fernando)`. Capabilities are labels shown in capture and
Fecho; they do not restrict which service can be recorded for a person (no such link in V1).

## 3. Catalogue

Services (current price; Fernando can change it in Gestão — past records keep their value):

| Hair | Kz | Nails | Kz | Other | Kz |
|---|---|---|---|---|---|
| Desfliso | 6.000 | Pedicure completo | 1.500 **provisional** | Aplicação de pestanas | 1.000 |
| Brexe | 2.000 | Unhas do pé | 700 | Tatuagem de sobrancelhas | 500 |
| Brexe com lavagem | 3.000 | Unhas da mão | 700 | Acertar sobrancelhas | 300 |
| Tranças | 5.000 | Aplicação de unhas | 1.300 | | |
| Lavagem de cabelo | 1.000 | Aplicação de unhas de gel | 2.000 | | |
| Lavagem e esticar | 1.500 | Porcelana | 3.500 | | |
| Secar cabelo | 1.000 **provisional** | | | | |
| Puxinho de gel | 2.000 | | | | |
| Puxinho trabalhado | 3.000 | | | | |
| Colagem de peruca | 6.000 | | | | |
| Lavagem de peruca | 1.000 | | | | |
| Lavagem de peruca com brexe | 2.000 | | | | |
| Ativar cachos | 3.000 | | | | |

Brexe, Brexe com lavagem and Lavagem de peruca com brexe are three separate services. 22 services.

Products (Stock Lite: no quantities; the reference price is information for Gestão only, never a cost):

| Product | Purpose | Unit word | Reference |
|---|---|---|---|
| Amaciador · Shampoo | Cabelo | garrafão 5 L | 8.000 each |
| Gel | Cabelo | embalagem | 7.000 |
| Brilho · Óleo perfumado · Ativador de cachos | Cabelo | embalagem | 2.000 each |
| Óleo de cabelo · Condicionador de cachos | Cabelo | embalagem | 1.500 each |
| Cola de perucas | Cabelo | embalagem | 8.000 |
| Pacote de unhas | Unhas | pacote | 3.000 |
| Cola de unhas | Unhas | frasco | 1.000 |
| Verniz | Unhas | frasco | 1.500 |
| Pacote de lima | Unhas | pacote **provisional** | 1.700 |
| Pacote de lixas | Unhas | pacote **provisional** | 2.500 |
| Autocolantes | Unhas | pacote **provisional** (pacote/conjunto) | 1.000 |

The unit words (garrafão 5 L, embalagem, frasco, pacote) are Sollelio's Portuguese rendering of "5 L container",
"container", "bottle", "package" — **Assumption**; Fernando can change any unit in Gestão. Purchasing context (Mercado do
Kikolo; Fernando and Fernanda buy, about monthly, with some extra) needs no configuration.

## 4. Permissions (Sollelio, 2026-10-13)

| Person | Permissions |
|---|---|
| Fernando | `catalogue.manage` · `movement.confirm` · `team.finance.read` · `business.health.read` · `period.decide` · `period.close` · `period.reopen` · `records.correct` |
| Merce | `team.finance.read` · `business.health.read` · `payment.confirm` |
| Fernanda · Laurindo · Patrícia | none (own situation with their PIN) |
| Sollelio Support (temporary, §2) | `catalogue.manage` · `movement.confirm` · `team.finance.read` · `business.health.read` · `period.decide` · `period.close` · `period.reopen` · `records.correct` · `payment.confirm` — every person-level permission in the repository, for support inside this organization only |

This changes the pilot matrix of 07 D8 (Merce no longer holds `movement.confirm`, `period.decide`, `records.correct`;
Duart is not onboarded) — recorded as the 2026-10-13 update in 07 D8. Consequences: among the salon's people, Fernando
is the only one who can confirm advances, expenses and purchases, approve a period and cancel a record; Merce is the only
one who can confirm payments to professionals. Sollelio Support can do all of these, for support only. Fernando does not get `payment.confirm` (§6.6).

## 5. Production sequence (each step needs explicit approval)

1. **Gestão to Prod:** apply `20261013000100_catalogue_management` through the seed-free Prod working copy
   (`supabase db push --linked --dry-run`, then `--yes`; `seeds: []`); verify history 33/33 and the schema identical to Dev.
2. **Frontend:** fast-forward `main` to the Gestão commit; Netlify deploys; smoke as for Business Health.
3. **Data:** run `salao-agradavel-onboarding.sql` in the Prod SQL editor; the script enforces the counts before
   commit (6 people, 22 services, 15 products, 8 periods, 20 permission rows) and rolls back otherwise.
4. **PINs** (each person chooses 6 digits, given privately; never written down in the repository):
   `select private.admin_set_person_secret((select p.id from public.people p join public.organizations o on o.id = p.organization_id where o.name = 'Salão Agradável' and p.display_name = '<name>'), '<6 digits>');`
   — for Fernando, Fernanda, Laurindo, Patrícia, Merce and Sollelio Support (set by Sollelio).
5. **Salon phone (Android):** `select private.admin_issue_enrollment_code((select id from public.organizations where name = 'Salão Agradável'), 'Telemóvel do salão');`
   → open `https://beauty.sollelio.com` on the phone, solve the check, type the code (*Ligar dispositivo*). Valid 24 h, single use.
6. **Merce's own phone** (if she confirms payments remotely, §6.5): a second code, label `Telemóvel da Merce`.
7. **First-day check with Fernando:** Hoje loads; record one real service; Área privada with his PIN → Gestão shows the
   22 services and 15 products; correct the provisional values as soon as they are known.

## 6. Open decisions and gaps

1. **Reserve opening balance 25.000 Kz — needs a decision before the first Fecho (not before day 1).** The reserve is
   the sum of per-period allocations minus uses; there is no opening balance. Recording it as an allocation of an
   operating week would show 25.000 Kz taken out of that week's result. Options: (a) a small schema addition for an
   opening balance (recommended; a new product decision); (b) a separate "Saldo inicial" period before 12/10 holding
   only that allocation (its position would show −25.000 Kz free); (c) start the reserve at 0 and note the 25.000 Kz
   outside the app.
2. **Expense categories — needs owner input before expenses are recorded.** None were given; *Registar despesa* needs
   at least one. Proposal for Fernando to confirm: Renda · Luz · Água · Transporte · Outros (operator SQL, as in runbook §1).
   Services and purchases do not depend on this.
3. **Merce's variable monthly salary.** No service rule fits it and V1 has no salary concept. Until decided, it stays
   outside the app (or is recorded as an expense in a category such as "Salários" when paid — a product decision).
4. **Ownership.** The brief does not say who the owners are; no `person_ownerships` row is loaded (the label *sócio*
   and the "decisão dos sócios" wording do not depend on it).
5. **Remote payment confirmation.** Confirming a payment needs Merce's PIN on a bound device. On the salon phone that
   means being there; otherwise her phone must be enrolled as a second device of the salon (§5 step 6). Pilot devices are
   Android only; iOS is not validated.
6. **Fernando and `payment.confirm`.** Not granted (07 D8 kept payment confirmation with someone other than the
   manager who is also paid). If Merce is not available, nobody among the salon's people can confirm payments or close a week (Sollelio Support can, for support only).
7. **Stock starts "OK".** A new product has no "unknown" state; the Stock screen shows all 15 as OK until someone marks
   them. Fernando or Fernanda should mark what is low on day 1.
8. **New products created during capture.** The existing Slice 03/05 flows still let the shared device create a
   product by name (unit word only, no price) while recording a purchase or preparing a list. Editing, pricing and
   deactivating are Gestão only.

## 7. Provisional values

Provisional for onboarding (Sollelio, 2026-10-13); not confirmed salon facts. Fernando corrects them in Gestão.

| Item | Provisional value |
|---|---|
| Secar cabelo | 1.000 Kz |
| Pedicure completo | 1.500 Kz |
| Pacote de lima | unit "pacote" (1 pacote) |
| Pacote de lixas | unit "pacote" (1 pacote) |
| Autocolantes | unit "pacote" (1 pacote/conjunto) |

They are not marked in the app (no "provisório" label on capture); this table and the SQL comments are the record.
