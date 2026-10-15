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

Load the real salon data and enroll the salon's Android phone per `salao-agradavel-onboarding.md` and `salao-agradavel-onboarding.sql`, which supersede `pilot-permissions.sql` for Salão Agradável (07 D8 update, 2026-10-13: Marcelina, display name Merce, reads and confirms payments only; Duart is not onboarded). Nothing of this has been done: real Salão Agradável onboarding is still pending.

Device support for the pilot stays **Android only** (Android Chrome validated); iOS Safari physical validation is still deferred until hardware is available, and remains a gate before pilot sign-off.

## Offline V1 rollout plan (prepared, not executed)

Prepared in Offline 8 (2026-10-15). **Nothing below has been run against Prod.** Each step follows: inspect → review
evidence → dry run / non-mutating check → review again → explicit mutation (approved) → smoke.

**What moves.** Database: `20261015000100_capture_time` (Offline 1) and `20261016000100_offline_period_sync`
(Offline 7). Frontend: `dev` (`61c58e6` … the Offline 8 commit) merged into `main`. Prod's migration history after
Business Health is not recorded here: `20261013000100_catalogue_management` (Gestão, already on `main`) may or may not
be on Prod — **inspect first**; if missing, it goes first (it is independent of the offline migrations).

**Order and dependencies.** `catalogue_management` (if missing) → `capture_time` → `offline_period_sync`.
`capture_time` drops and recreates the four capture commands with an extra, defaulted `p_occurred_at` (no overload).
`offline_period_sync` patches `approve_period` / `close_period` by inserting the sync check after their
`STALE_REVIEW` line and **aborts the whole migration** if that line is not found exactly once — it must run on the
same function bodies Dev has (the schema diff below proves it).

**Never to Prod:** every file in `supabase/seeds/` — in particular `18_offline_capture.sql` (organizations O / P / Q,
PINs, multi-use code) and `19_offline_period_sync.sql` (*Teste Offline Sync*, 1 095 periods, a revoked device, code
`TEST-ORG-SYNC-2026`). Use the seed-free working copy (`seeds: []`); never `--include-seed`.

**Compatibility.**
- *Old frontend + new database (the window between the two steps): safe.* Capture calls without `p_occurred_at` keep
  today's behaviour and fingerprints; no device ever reports, so no device is offline-capable and approve / close are
  unchanged. Only difference: the distinct inactive codes (`PERSON_INACTIVE`, …) show the old generic message.
- *New frontend + old database: not safe for offline work.* Queued services call `record_service` with
  `p_occurred_at` → function not found → kept and retried, never sent; sync reports fail silently; the Fecho gate's
  read fails (the server, old, does not block). Online capture still works. Therefore **database first**.

**Steps.**
1. Inspect (read-only, linked to the seed-free copy): `supabase migration list` against Prod; `select count(*)` of
   organizations, devices, enrollment codes, periods; a schema dump of `public` / `private`. Record the result here.
2. Review: the dump against Dev's at the matching migration; the exact list of migrations still to apply.
3. Dry run: `supabase db push --dry-run` from the seed-free copy: it must list only the migrations above.
4. Review again, then — with explicit approval — `supabase db push` (no seed).
5. Database smoke (no rows created): history equals Dev's; schema dump identical to Dev's (0 differing lines);
   `report_device_sync` and `fecho_sync_status` executable only by `authenticated`, refused without a session
   (`42501`); `private.device_sync_reports` with RLS on and no browser grants; `approve_period` and `close_period`
   contain `require_period_sync_safe`; `record_service` has one signature, with `p_occurred_at`; `anon` executes no
   function.
6. Frontend: fast-forward `main` to the reviewed `dev` commit; Netlify production deploy.
7. Frontend smoke (automated, no CAPTCHA solved, nothing created): app loads at `https://beauty.sollelio.com`; bundle
   has the Prod URL, one publishable key, no Dev reference; `/sw.js` served with `Cache-Control: no-cache` and a
   precache list of static files only; `/manifest.webmanifest` served; SPA deep links; no runtime errors.
8. Offline smoke on Prod happens only with the real salon phone, during onboarding, with the salon's agreement
   (runbook §8 preparation, then one offline service sent once) — not with synthetic data.

**No synthetic data in Prod** (after step 4 and after onboarding): no organization named `Teste%`; no period labelled
`Sync %`; no enrollment code for `TEST-ORG-%` (compare `code_hash` with the hashes of the seed codes); no device with
`offline_capable_at` before the salon's phone was enrolled; `private.device_sync_reports` empty until the salon's phone
reports.

**Rollback.** Migrations are forward-only. Rolling back the frontend is safe **only before any phone has reported**
(no `offline_capable_at` set). After that, the old frontend never reports again, so every later period stays blocked
until the phone is revoked (which disconnects it) or a reviewed database change clears `offline_capable_at`; and
anything queued on the phone is invisible to the old frontend (kept, not sent). After the pilot starts using offline,
**fix forward**.
