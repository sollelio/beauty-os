# Production database checkpoint (2026-10-07)

**Beauty OS Prod** · project ref `kzirzmtarnskwirufyjw` · `https://kzirzmtarnskwirufyjw.supabase.co` · us-east-1.
Repository baseline `cf531c4`. The repository stays linked to Beauty OS Dev; Prod is targeted only through a separate,
seed-free working copy (migrations + a config with seeding disabled and no seed paths).

## State before applying
No migration history, no `public` objects beyond default grants, no `private` schema, no Auth users, identities or sessions.

## Applied
All 21 migrations `20261007000100` … `20261007002100`, with **no seed files** (`seeds: []`). Local and remote histories
match 21/21. The `public` and `private` schemas of Prod are identical to Dev's (schema dumps, 0 differing lines):
40 tables (RLS on every `public` table), 76 functions, 4 views, 7 triggers, 12 policies. The operator-procedure
self-test in `…001900` ran and rolled itself back.

## Auth
`enable_anonymous_sign_ins` switched to `true` (ADR-0009) — the only setting changed; everything else, including rate
limits (30 anonymous sign-ins per hour per IP), was already as declared. `site_url` is still the default and is set at the
Netlify step.

## Verified (schema level)
- Browser roles: `SELECT` only on the operational tables (RLS-scoped) plus the Slice 05 stock columns; no write grant on
  any financial or period table; nothing in `private` except the three actor-context helpers; `anon` can execute no function.
- All trusted commands present and executable only by `authenticated`.
- Operator procedures (`private.admin_*`, cleanup) not executable by browser roles; `private.security_audit` present;
  `admin_set_person_secret` accepts 6 digits and never audits the PIN.
- Cleanup: `cron.schedule('beauty-os-cleanup-unbound-anonymous-users', '17 3 * * *')` created by `…001900` (applied without
  error). Removes anonymous users older than 24 h **with no device binding**; bound or revoked devices are never removed.
  The CLI cannot read `cron.job`; confirm once in Dashboard → Integrations → Cron.
- No Dev seed data, synthetic salons, development enrollment codes or real salon data.

## Deferred to the production frontend step
- **Netlify environment:** `VITE_SUPABASE_URL=https://kzirzmtarnskwirufyjw.supabase.co`,
  `VITE_SUPABASE_PUBLISHABLE_KEY=<Prod publishable key>`, and `VITE_TURNSTILE_SITE_KEY` once Turnstile exists. Public values
  only; never commit them; never use a secret or service-role key in the frontend.
- **Supabase Auth:** `site_url` → `https://beauty.sollelio.com`; CAPTCHA (Turnstile) enabled with its secret after the
  Turnstile widget is created for `beauty.sollelio.com`.
- **Runtime smoke on the deployed app:** anonymous device sign-in; an unbound device sees nothing and is refused by every
  trusted function and protected table; operator procedures unreachable.
- Then the real salon data and device enrollment per `pilot-runbook.md` and `pilot-permissions.sql`.
