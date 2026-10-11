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

## Production frontend (2026-10-08)

- **Netlify site:** `beauty-os` (`beauty-os.netlify.app`), repository `sollelio/beauty-os`, **production branch `main`**
  (merging `dev` into `main` deploys production). Build from `netlify.toml`: `npm run build`, publish `dist`, Node 22, SPA
  fallback `/* → /index.html 200`.
- **Deployed:** `main` at `d593b4f` (fast-forward from `6e691f3`), clear-cache production deploy.
- **Environment (Netlify, Production / Builds; public values only):** `VITE_SUPABASE_URL` (Beauty OS Prod),
  `VITE_SUPABASE_PUBLISHABLE_KEY` (Prod publishable key), `VITE_TURNSTILE_SITE_KEY`. Values are not stored in Git.
- **Domain:** `https://beauty.sollelio.com` — Cloudflare DNS `CNAME beauty → beauty-os.netlify.app`; Let's Encrypt certificate;
  `http → https` 301.
- **Supabase Prod Auth:** `site_url = https://beauty.sollelio.com`; no additional redirect URLs (no email/OAuth flows);
  anonymous sign-ins on; **CAPTCHA enabled, provider Cloudflare Turnstile** (secret only in Supabase); rate limits unchanged.
- **Cron:** `beauty-os-cleanup-unbound-anonymous-users` confirmed in the dashboard (daily 03:17).

### Production smoke (automated, no CAPTCHA solved, nothing created)
| Check | Result |
|---|---|
| HTTPS at the canonical domain; app renders (configuration present) | PASS |
| Turnstile widget rendered; enrollment blocked until it is solved | PASS |
| Bundle: Beauty OS Prod URL, exactly one publishable key, no secret / service-role key, no Dev reference | PASS |
| Supabase Prod refuses anonymous sign-in without a Turnstile token (`captcha_failed`) | PASS |
| Without a device session: no table readable (`42501`), no app function executable, operator procedures not exposed | PASS |
| SPA deep link / refresh (`/privado/fecho` → enrollment screen) | PASS |
| No Dev salon, seed or business content; browser talks only to the app, Beauty OS Prod and Turnstile | PASS |
| No material console/runtime errors | PASS |

Afterwards Prod still had no rows in any `public`, `private` or Auth table and no Auth users.

**Manual step (a human must solve Turnstile):** on any browser (not the salon phone), open `https://beauty.sollelio.com`,
tick *Verify you are human*, enter `AAAA-BBBB-CCCC`, press *Ligar dispositivo* → expected *Código inválido ou expirado.*
This proves the CAPTCHA-protected anonymous sign-in succeeds while the device stays unbound; the unbound user is removed by
the cleanup after 24 h. What an unbound device session can reach is covered by the schema-level checks above and by the
identical Dev schema's test suite.

## Business Health V1 (2026-10-11)

- **Database:** 11 migrations `20261008000100_business_health` … `20261011000100_business_unpaid_inference` applied to
  Prod through the seed-free working copy (`seeds: []`, dry run first). History 32/32, matching Dev. Functions only: the
  Business Health reads and redaction helpers, plus `private_context_status` (a `business_health` flag),
  `admin_set_permission` (accepts `business.health.read`) and the Stock reads/trigger reading active purchases only. No
  table, policy or data change. Afterwards the `public`/`private` schema dump is identical to Dev's (0 differing lines);
  RLS on all 32 `public` tables; `anon` executes no function; browser roles execute no Business Health helper in
  `private`; the Business Health reads are executable only by `authenticated` and refuse an unbound session
  (`NOT_AUTHORIZED`). Prod still has no rows in any table and no Auth users (no seeds, no test organizations or PINs).
- **Frontend:** `main` fast-forwarded `d593b4f..3137561`; Netlify production deploy of `3137561` live at
  `https://beauty.sollelio.com`.
- **Production smoke (automated, no CAPTCHA solved, nothing created): PASS.** App loads; Turnstile shown and enrollment
  blocked until solved; anonymous sign-in without a token refused (`captcha_failed`); the six Business Health reads and
  every table denied without a session; `/privado/negocio/insights` and `/privado/negocio/financas` deep links served
  (SPA) and show only enrollment on an unbound device; bundle: Prod URL, one publishable key, no secret, no Dev
  reference, no test content; browser talks only to the app, Supabase Prod and Turnstile; no app runtime errors.
- **Not yet exercised in Production:** the Negócio screens with real data. They need a bound salon device and a verified
  person with `business.health.read`, which exist only after the real salon setup. They were exercised on Dev.

## Next: real salon setup (needs explicit approval)

Load the real salon data and enroll the salon's Android phone per `pilot-runbook.md` and `pilot-permissions.sql` (check the spelling of every name, including "Duart"; it now also grants `business.health.read` to Fernando, Mercy and Duart). Nothing of this has been done: real Salão Agradável onboarding is still pending.

Device support for the pilot stays **Android only** (Android Chrome validated); iOS Safari physical validation is still deferred until hardware is available, and remains a gate before pilot sign-off.
