# ADR-0009 — Shared-device principal and verified actor

**Status:** Accepted (device/verification spike checkpoint, 2026-10-06) — Alternative A with the mitigations below. Physical **iOS Safari validation is deferred until hardware is available** and remains a required gate before pilot / production-readiness sign-off (see *Validation*).
**Related:** [Architecture Definition §7, §23](../architecture-definition.md#23-device--elevation-spike-specification) · [ADR-0002](0002-tenancy-and-rls-security-boundary.md) · [ADR-0003](0003-trusted-database-commands.md) · [ADR-0006](0006-command-idempotency.md) · 05 §3–§4 · 07 §8

## Context

The salon operates one shared smartphone (`Confirmed`). Ordinary capture must not require per-action login (05 §3). Sensitive actions must be attributed to an individual verified person (07 §8 B2–B10). The private context must not pass to the next holder (05 §4). Remote finance uses a personal device (01 §1), and personal devices must fit later (05 §2).

A bounded spike (Architecture Definition §23) evaluated five alternatives on a disposable local Supabase stack, using official Supabase documentation as the external source, with automated access-matrix tests and a physical Android validation.

## Decision

**Alternative A: Supabase anonymous device principal + server-side device binding + database-held verification grants + trusted actor context.**

- **Device principal.** Each shared device signs in as a Supabase anonymous user (role `authenticated`, `is_anonymous = true`). It has no organization access until it redeems a **single-use, expiring enrollment code** through a database command; the **device binding** (device → exactly one organization) is held server-side.
- **Person principal.** A person on a personal device is a normal Supabase Auth user linked to their person record. It resolves through the same actor context. Its sign-in method is deferred.
- **Verification grants.** Server-side verification of a person's secret creates a **grant bound to the device and its Auth `session_id`**, with a **scope** — `one_shot` (consumed by exactly one sensitive command; never authorizes reads) or `private_session` (authorizes sensitive reads; never a one-shot command) — and an expiry. Grants are revocable (explicit exit, administrative revocation) and live in a schema not exposed to the API.
- **Actor context.** One database helper, not exposed to the API, derives organization, principal kind, device, verified person, scope and permission grants **only** from the verified JWT (`sub`, `session_id`) and database state. Every resolution checks that **the `auth.sessions` row for the JWT's `session_id` exists**, the **device binding is not revoked**, and the **grant is current**. Policies use it in the `(select …)` pattern; commands call it directly. No command accepts organization, actor, verification or permission as input.
- **Two attribution levels** (unchanged): device + declared operator (unverified) for ordinary records; verified actor for sensitive records.

### Mandatory mitigations

1. **Database-side checks on every request**: session-row existence, device-binding validity, grant validity — a valid JWT signature alone never suffices.
2. **Revocation goes through the database device binding** (effective on the next request). Signing out or deleting the device's Auth user is cleanup, not the authorization control.
3. **Failed secret verifications are returned, not raised**, so attempt counters and audit commit; counters per person and per device, updated under row locks; temporary lockout; audit entries without the secret.
4. **Abuse controls on anonymous sign-in**: CAPTCHA (e.g. Turnstile) and periodic cleanup of unbound anonymous users.
5. **Re-enrollment procedure** for a device whose browser storage is lost (anonymous users cannot sign back in).
6. **Short private-session expiry, explicit exit and removal of sensitive frontend caches** on exit, expiry or revocation.
7. **One-shot grants for sensitive commands.**
8. **JWT expiry of at least 5 minutes** (documented guidance). It bounds only the non-database revocation paths in *Consequences*.
9. **Secret hashes** stored one-way, in a schema not exposed to the API; the raw secret never logged.
10. **Idempotent replay (ADR-0006)** answers only the original principal and organization, returns only the original result, and requires no fresh verification.

## Consequences

**Revocation layers (measured in the spike):**

| Layer | Effect |
|---|---|
| Device binding revoked (database) | Access ends on the next request, with the same access token. |
| Grant exit / expiry / revocation (database) | Access ends on the next request. |
| Auth sign-out or user deletion | `auth.sessions` row removed → actor context denies on the next request. |
| Auth ban or refresh-token-reuse revocation | Session row remains; the issued access token keeps working until its expiry plus PostgREST's 30-second clock skew. These paths are not used as authorization controls (mitigation 2). |

- A private context belongs to the device session, so it is visible to every tab and holder of that device until exit or expiry. Isolation between holders relies on mitigations 6–7; this is inherent to a shared device.
- The actor context costs a few milliseconds per statement; the `(select …)` pattern evaluates it once per statement.
- Admin capabilities (e.g. deleting a device's Auth user) run only in trusted server-side code holding the secret key; their callers are authorized by the database actor context. The browser holds only the publishable key.
- Everything used is available on the free tier.

## Rejected alternatives

- **B — provisioned permanent device account.** Passed the same tests and remains the **fallback** if anonymous principals become unsuitable. Not chosen: it needs the Admin API for every device and device-credential handling, and an Auth ban does not end access promptly.
- **C — separate person session on the shared device.** Rejected for the shared device: Supabase sessions have no one-action scope; a person session persists in all tabs until sign-out, and server-side inactivity/time-box limits require a paid plan; per-account sign-in lockout requires a Teams/Enterprise hook. Person sessions remain correct for **personal devices**.
- **D — server-minted short-lived token.** Rejected: access tokens cannot be revoked before expiry, so a database check is still required; it adds signing-key management and stale claims without benefit over database grants.
- **E — client-trusted verified person.** Rejected: the spike demonstrated a cross-organization data leak from a spoofed header.

## Validation

| Item | Status |
|---|---|
| Automated access matrix, timed revocation/expiry/idempotency/brute-force tests, Chromium persistence tests, Edge Function admin boundary | **Passed** (disposable local Supabase stack) |
| Physical **Android Chrome** (Android 10, Chrome 154): enrollment, persistence after reload / browser close / restart, two tabs, refresh after JWT expiry, private context enter / exit / expiry, back navigation, offline save with retry of the same `command_id` and replay, tab eviction | **PASSED** — manual result corroborated by server-side records (one Auth session throughout; grants granted, exited and expired; one saved action, one command-journal entry, replays without a new mutation; one-shot grant consumed once) |
| Physical **iOS Safari** | **DEFERRED UNTIL HARDWARE IS AVAILABLE** — required gate before pilot / production-readiness sign-off; does **not** block this ADR or the start of implementation. Emulated or desktop engines are not accepted as a substitute. The same 12-step procedure applies; the main open risk is browser storage eviction forcing re-enrollment (mitigation 5). |

## Deferred

- Remote personal-device sign-in method (password, magic link, phone OTP, …).
- Verification secret format, lockout thresholds and timeout values (also need product input on UX, 05 §3).
- Idle-timeout extension of a private session on activity.
- Additional protection of secret hashes (e.g. a pepper).
- A dedicated function-owner role with forced RLS (ADR-0003).
