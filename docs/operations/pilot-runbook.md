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

**Sollelio support identity (interim; architecture §7):** a person who is Sollelio's support identity, not salon personnel,
gets the kind `support` (every person is `personnel` by default). It then appears in no person list on the salon's devices,
only on a support-purpose device (§3), and keeps its permissions and PIN. Refused for anyone with a service capability or a
rule (`PERSON_IS_PERSONNEL`). Audited (`person_kind_set`).
```sql
select private.admin_set_person_kind(:person, 'support', '<reason>');     -- back: 'personnel'
```

**Operating schedule (optional; Fecho «Terminar a semana», ADR-0010 §5 amendment):** the last operating weekday (ISO:
1 = Monday … 6 = Saturday, 7 = Sunday) and the usual closing time, in the organization's timezone. Audited
(`week_schedule_set`). Without it nothing changes: a week ends at its calendar end.
```sql
select private.admin_set_week_schedule(:org, 6::smallint, time '20:00');   -- Saturday, usually closes at 20:00
select private.admin_set_week_schedule(:org, null, null);                  -- remove it
```

## 2. Periods

Periods are explicit and never derived from the calendar (07 §10.3). Create each one before it starts; records whose
date falls outside every period are kept but appear in no Fecho until a period covering them exists.

```sql
select private.admin_create_period(:org, '<label>', '<first day>', '<last day>');   -- rejects overlaps
```

**Ending the week (Fecho «Terminar a semana»; organizations with a schedule):** on the period's last operating day, after
the last client, a `period.decide` holder ends the week in Fecho with their PIN (before the usual closing time the app asks
first). From then on, activity that happened after that moment is refused in that period (`PERIOD_WEEK_ENDED`); what counts is
when it happened, not when a phone sends it, so work a phone saved offline before the end still syncs. Each operational phone
opens Beauty OS with a connection to confirm it holds nothing more; then the period can be approved. If there is still
activity, «Continuar a semana» (same permission) reopens the week while the period is not approved; after approval, annul
the approval first (only before any payment). Every declaration and withdrawal stays in the period's history. To see them:
`select kind, at, early, person_id from public.period_week_end_events where period_id = :period order by seq;`

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
- **A phone blocks Fecho (offline sync, ADR-0010 §5):** approval and close need every active offline-capable phone to
  have reported after the period's end with nothing pending, unconfirmed or to review. To see which phones a period is
  waiting for:
  ```sql
  select v.id, v.label, v.enrolled_at, v.offline_capable_at, r.reported_at, r.days, r.undated
    from private.devices v left join private.device_sync_reports r on r.device_id = v.id
   where v.organization_id = :org and v.revoked_at is null and v.offline_capable_at is not null
   order by r.reported_at nulls first;
  ```
  A phone in use reports when the app is opened with a connection: ask the salon to open Beauty OS on it, send what it
  holds and review what is "Para rever". A phone that is **lost, broken, replaced or no longer used** (including the old
  binding of a re-enrolled browser) is revoked with `private.admin_revoke_device(:device_id, '<reason>')` — it then
  stops counting, and if it ever comes back online it cannot send anything (its local work stays on it, never moved).
  There is no override of the block.
- **Support device (ADR-0010 §5 amendment):** a device used only for Sollelio support, diagnosis or administration
  stays bound but is taken out of the Fecho sync block by making it a support device — not by revoking it:
  ```sql
  select private.admin_set_device_purpose(:device_id, 'support', '<reason>');
  ```
  It is refused (`DEVICE_HAS_OFFLINE_WORK`) while the device's last report holds work: open Beauty OS on it with a
  connection first, send what it holds, confirm or discard drafts and review what is "Para rever". A support device
  then works online only — it keeps nothing offline and is never offline-capable; anything it had kept offline from
  before is refused by the server and stays "Para rever" on it. Every change is audited (`device_purpose_set`). To
  make it a capture device again: `select private.admin_set_device_purpose(:device_id, 'operational', '<reason>');` —
  it rejoins the block with its next report. The purpose of the bound devices:
  `select id, label, purpose, offline_capable_at from private.devices where organization_id = :org and revoked_at is null;`

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
| `business.health.read` | B11 | Negócio (Business Health) |
| `catalogue.manage` | B10 (catalogue) | Gestão: add, edit, deactivate services and products; change prices and units |

Own situation (B3) needs only a PIN. **Salão Agradável (07 D8 update, 2026-10-13):** see [`salao-agradavel-onboarding.md`](salao-agradavel-onboarding.md) §4; the onboarding SQL sets them. **Earlier pilot assignments (07 D8):** run [`pilot-permissions.sql`](pilot-permissions.sql) after the people exist — Fernando: movement.confirm, team.finance.read, period.decide, period.close, period.reopen, records.correct; Marcelina (Merce): movement.confirm, team.finance.read, period.decide, payment.confirm, records.correct; everyone else none.

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

## 8. Offline V1 (ADR-0010)

- **What works without a connection** on a phone that opened Beauty OS with a connection in the last 48 hours: the app
  opens (installed, from the home screen), *Registar serviço* (kept on the phone, sent once when the connection
  returns), and *Adiantamento / Despesa / Compra* as drafts — they become records only when someone confirms them with
  a PIN, online. Everything private (*Área privada*, Fecho, Negócio, Gestão), Anular, Stock and Lista need a connection.
- **Preparing a phone:** enroll it (§3), open Registar serviço once with a connection, install it to the home screen,
  and open it from the icon.
- **Never clear the browser's data** (or uninstall the app) on a phone that shows *por enviar*, *por confirmar com PIN*
  or *para rever*: that work exists only on the phone and cannot be recovered from the server.
- ***Para rever*:** what the server refused (inactive person/service/payment, a closed or approved period, a capture
  older than 48 hours or in the future). The salon decides on the phone: *Registar novamente* (a new record now) or
  *Descartar*. Nothing is changed or moved automatically.
- **Fecho waits for a phone:** §3, *A phone blocks Fecho*.
- **A phone's clock is wrong:** services it saves offline may come back as *A hora guardada está no futuro* (or older
  than 48 hours); set the phone to automatic date and time.

