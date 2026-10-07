# Pilot operator runbook

Operator procedures for the Beauty OS pilot while configuration UIs are not designed (07 I6–I8). They run in the
**Supabase SQL editor** of the target project (role `postgres`). They live in the `private` schema, which the API does
not expose: no device, person or browser can call them (tested in `tests/db/pilot.test.ts`). Every procedure writes
`private.security_audit` (never secrets).

> Never run `supabase db push --include-seed` against a pilot/production project: `supabase/seeds/` is synthetic
> Dev data, including multi-use development enrollment codes.

## 1. Organization setup (once)

Fill the placeholders with the owner's data (OWNER INPUT) and run as one transaction. Ids are generated.

```sql
begin;
insert into public.organizations (name, timezone, currency_code, currency_exponent, currency_symbol)
values ('<salon name>', '<IANA timezone>', '<ISO currency>', <minor-unit digits>, '<symbol>') returning id;   -- keep as :org
insert into public.payment_methods (organization_id, code, label, sort_order) values (:org, 'numerario', 'Numerário', 1), (:org, 'transferencia', 'Transferência', 2);
insert into public.people (organization_id, display_name) values (:org, '<name>') returning id;               -- one per person
insert into public.person_capabilities (organization_id, person_id, label, sort_order) values (:org, :person, '<capability>', 1);
insert into public.person_ownerships (organization_id, person_id) values (:org, :owner);                         -- owners only
insert into public.services (organization_id, name, default_price_minor, sort_order) values (:org, '<service>', <price in minor units>, 1);
insert into public.expense_categories (organization_id, label, hint, sort_order) values (:org, '<category>', null, 1);
insert into public.purchase_origins (organization_id, label, sort_order) values (:org, '<origin>', 1);
insert into public.unit_words (organization_id, word, sort_order) values (:org, '<unit word>', 1);
commit;
```

Then, per person: **rule** (`select private.admin_set_rule(:person, 'standing' | 'contextual', <percent or null>, '<effective from>', :set_by)`),
**PIN** (exactly 6 digits) for anyone who confirms or enters the private area (`select private.admin_set_person_secret(:person, '<6 digits>')`); PINs are chosen at production setup and never stored in the repository,
and **permissions** (§4).

## 2. Periods

Periods are explicit and never derived from the calendar (07 §10.3). Create each one before it starts; records whose
date falls outside every period are kept but appear in no Fecho until a period covering them exists.

```sql
select private.admin_create_period(:org, '<label>', '<first day>', '<last day>');   -- rejects overlaps
```

## 3. Devices

- **Enroll:** `select private.admin_issue_enrollment_code(:org, '<device label>');` returns a code such as
  `K7QM-2ZXP-9HTA` (single use, valid 24 h; optional arguments: validity, max uses ≤ 20). Type it once on the salon
  phone (*Ligar dispositivo*). The plaintext is not stored.
- **List:** `select * from private.admin_list_devices(:org);`
- **Lost or replaced device:** `select private.admin_revoke_device(:device_id, '<reason>');` — access ends on the next
  request; its records keep their attribution.
- **Browser storage lost / re-enroll:** issue a new code and enroll again; revoke the old device. A browser whose
  device was revoked shows *Ligar dispositivo* and enrolls with a new code (it gets a fresh identity automatically).
- **Unused codes:** `select private.admin_revoke_enrollment_codes(:org);`

## 4. Permissions (07 §8)

`select private.admin_set_permission(:person, '<permission>', true | false);`

| Permission | Boundary | Allows |
|---|---|---|
| `movement.confirm` | B2 | Confirm advances, expenses, purchases |
| `team.finance.read` | B4 | Private area: anyone's situation, Equipa, Fecho |
| `period.decide` | B5 | Contextual rules, owners' decision, reserve, approve, annul approval |
| `payment.confirm` | B6 | Confirm payments |
| `period.close` | B7 | Close |
| `period.reopen` | B8 | Reopen (mandatory reason) |
| `records.correct` | B9 | Cancel (anular) a mistaken service, advance, expense or purchase while its period is *Aberto* |

Own situation (B3) needs only a PIN. **Pilot assignments (07 D8):** run [`pilot-permissions.sql`](pilot-permissions.sql) after the people exist — Fernando: movement.confirm, team.finance.read, period.decide, period.close, period.reopen, records.correct; Mercy: movement.confirm, team.finance.read, period.decide, payment.confirm, records.correct; everyone else none.

## 5. Abuse controls (ADR-0009 mitigation 4)

- **Cleanup of unbound anonymous users:** `pg_cron` job `beauty-os-cleanup-unbound-anonymous-users` runs daily at 03:17
  (`private.cleanup_unbound_anonymous_users()`, 24 h grace). Users bound to a device (revoked or not) are kept.
- **CAPTCHA (Turnstile, free):** at production setup, create a Turnstile widget for the app's domain, enable
  *Auth → Bot and Abuse Protection → CAPTCHA (Turnstile)* with its secret in the Supabase project, and set
  `VITE_TURNSTILE_SITE_KEY` in the app build. The enrollment screen then requires the challenge. Not enabled on Dev
  (the automated tests sign in anonymously).

## 6. Pilot verification defaults (07 D8)

PIN 6 digits · confirmation (one-shot grant) 2 minutes · private area 5 minutes · 5 wrong PINs per person within 15 min → 15-minute lockout · 10 wrong PINs per device within 15 min → 15-minute lockout. These are the values the database applies today; `admin_set_person_secret` accepts only 6-digit PINs.

## 7. Corrections (07 D8)

A mistaken record is cancelled, never edited or deleted: *Corrigir este registo* on the success screen (or ⋯ in a person's history, or *Anular* in Fecho → Dinheiro do período) → reason → a person with `records.correct` confirms → the original stays in the history as *anulado* and stops counting; record the right value again through the normal flow. Only while the record's period is *Aberto*. After approval: annul the approval first (only before payments); with payments or a closed period there is no correction yet.
