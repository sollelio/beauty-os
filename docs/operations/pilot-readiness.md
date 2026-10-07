# Pilot readiness (Pilot hardening 01 · 2026-10-07)

Baseline `9b1a9d4` (Slices 01–06 complete). Statuses: READY · BLOCKED — OWNER INPUT · BLOCKED — TECHNICAL ·
DEFERRED BEFORE PRODUCTION · NOT REQUIRED.

| Item | Status | Why | Action |
|---|---|---|---|
| Device enrollment | READY | Random single-use, 24 h codes issued by an operator procedure; plaintext never stored | Runbook §3 |
| Device revocation | READY | Operator procedure revokes the binding and its grants; effective next request; audited | Runbook §3 |
| Re-enrollment (storage lost / revoked browser) | READY | New code; a revoked browser gets a fresh identity automatically | Runbook §3 |
| Unbound-user cleanup | READY | Daily `pg_cron` job, 24 h grace, audited | Runbook §5 |
| Anonymous abuse protection (CAPTCHA) | DEFERRED BEFORE PRODUCTION | Code path ready (env-gated Turnstile); keys and Auth setting belong to the production project/domain, and Auth rate limits already apply | Runbook §5 at production setup |
| Organization / people / catalogue / periods / rules setup | READY (procedure) | Operator template and procedures; configuration UIs not designed (07 I6–I8) | Runbook §1–2 with the owner's data |
| Permissions | BLOCKED — OWNER INPUT | Six permissions exist; who holds each is the owner's decision (07 P1) | Owner answers Q1 |
| PIN / grant / lockout values | READY (provisional) | PIN 4–12 digits; one-shot grant 120 s; private session 5 min; lockout 5 failures/person, 10/device in 15 min → 15 min. Safe defaults; values are development placeholders (05 §3), not frozen product rules | Owner may change (Q4) before production |
| Corrections | BLOCKED — OWNER INPUT | A wrong service, advance, expense or purchase in an open period cannot be corrected or voided (07 I1). Annul/reopen cover approval and owners' decision only | Owner answers Q2 |
| Network / retry | READY | Data preserved; same `command_id` retry; server replay (ADR-0006, D5) | — |
| Closed / approved-period handling | READY | Capture refused with a plain message; annul or reopen per 07 D7 | — |
| Verification expiry / permission denied / lockout messages | READY | Expired one-shot grant re-verifies the same person transparently; denial and lockout have plain messages | — |
| iOS validation | BLOCKED — OWNER INPUT | ADR-0009 requires physical iOS Safari before pilot sign-off; irrelevant if the salon phone is Android | Owner answers Q3 |
| Production environment (Supabase Prod) | DEFERRED BEFORE PRODUCTION | Not created by design of this step | Next step |
| Netlify / domain | DEFERRED BEFORE PRODUCTION | Not configured by design of this step | Next step |
| Dev test pollution (synthetic users, test periods) | NOT REQUIRED | Dev only; cleanup job covers unbound users; seeds never go to production | — |

## Owner questions

1. **Permissions:** for each pilot person, which of `movement.confirm`, `team.finance.read`, `period.decide`,
   `payment.confirm`, `period.close`, `period.reopen`?
2. **Corrections:** before the pilot, may an authorized person **anular** a mistaken service, advance, expense or purchase
   while its period is still *Aberto* — with a mandatory reason, the original kept and shown as anulado — or does the
   pilot run without any correction (mistakes stay until a later correction flow)?
3. **Device:** is the salon's shared phone Android or iPhone?
4. **PIN and lifetimes (optional):** keep PIN 4–12 digits, confirmation 2 min, private area 5 min, lockout after
   5 wrong PINs for 15 min?
