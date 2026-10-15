# Pilot readiness (updated 2026-10-15)

Baseline `7e285ed` + pilot corrections. Statuses: READY · BLOCKED — OWNER INPUT · BLOCKED — TECHNICAL ·
DEFERRED BEFORE PRODUCTION · NOT REQUIRED.

| Item | Status | Why | Action |
|---|---|---|---|
| Device enrollment | READY | Random single-use, 24 h codes issued by an operator procedure; plaintext never stored | Runbook §3 |
| Device revocation | READY | Operator procedure revokes the binding and its grants; effective next request; audited | Runbook §3 |
| Re-enrollment (storage lost / revoked browser) | READY | New code; a revoked browser gets a fresh identity automatically | Runbook §3 |
| Unbound-user cleanup | READY | Daily `pg_cron` job, 24 h grace, audited | Runbook §5 |
| Anonymous abuse protection (CAPTCHA) | DEFERRED BEFORE PRODUCTION | Env-gated Turnstile ready; keys and Auth setting belong to the production project/domain | Runbook §5 at production setup |
| Permissions | READY | Pilot matrix decided (07 D8); applied as pilot data by `pilot-permissions.sql`, not code | Run at production setup |
| PIN / grant / lockout values | READY | Pilot defaults decided (07 D8) and enforced: 6-digit PIN, 2 min, 5 min, 5/person and 10/device in 15 min → 15 min | — |
| Corrections | READY | Cancellation in an open period with `records.correct`, reason, exact grant; original kept as *anulado*; excluded from every active figure (07 D8) | — |
| Network / retry | READY | Data preserved; same `command_id` retry; server replay | — |
| Closed / approved-period handling | READY | Capture and cancellation refused with plain messages; annul/reopen per 07 D7 | — |
| Shared salon phone | READY | Android; physical Android Chrome validation PASSED (ADR-0009) | — |
| iOS validation | NOT REQUIRED | Android-only pilot. Still required before claiming supported iPhone use | Before any iPhone use |
| Organization / people / catalogue / periods / rules / PINs | DEFERRED BEFORE PRODUCTION | Real salon data, loaded with the operator template and procedures | Runbook §1–2 at production setup |
| Production environment (Supabase Prod) | DEFERRED BEFORE PRODUCTION | Not created yet | Next step |
| Netlify / domain | DEFERRED BEFORE PRODUCTION | Not configured yet | Next step |
| Dev test pollution | NOT REQUIRED | Dev only; seeds never go to production | — |
| Offline V1 (Offline 1–8) | READY ON DEV — browser evidence | Cold start offline, Registar serviço offline (sent once), movement drafts confirmed online with the PIN, review of refused work, device sync reports and the Fecho block, operator revocation: DB tests and Chromium mobile-emulation runs against Dev (2026-10-15) | Physical validation below; production rollout ([production-checkpoint](production-checkpoint.md#offline-v1-rollout-plan-prepared-not-executed)) |
| Offline V1 on a physical Android phone | OPEN | Not run on a real phone yet (installation, airplane mode, real closes) | [offline-device-validation](offline-device-validation.md) §A, before the pilot uses offline |
| Offline V1 on a physical iPhone (Safari) | OPEN — PILOT GATE if iPhones are used | No device available; iOS storage and home-screen behaviour unverified | [offline-device-validation](offline-device-validation.md) §B |
| Offline V1 in Production | DEFERRED BEFORE PRODUCTION | Migrations `20261015000100`, `20261016000100` and the offline frontend are on `dev` only | Rollout plan, explicit approval |

**Remaining before the pilot:** production setup (Supabase Prod, Netlify/domain, CAPTCHA keys) and the real salon's data and configuration.
