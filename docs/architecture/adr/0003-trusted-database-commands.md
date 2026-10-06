# ADR-0003 — Trusted database commands for financial, production and period writes

**Status:** Accepted (Architecture Definition checkpoint, 2026-10-06)
**Related:** [Architecture Definition §9, §16, §17](../architecture-definition.md#9-trusted-command-architecture)

## Context

Financial events must be captured once, atomically and with attribution (02 §4, 06 #1, 04 J1). Several writes span rows and modules (a purchase with lines and contributions; approval with per-person outputs; payment against an approval). Invariants require locks (period state, review revision, reserve balance). Client-orchestrated multi-row writes cannot guarantee any of this, and Edge Functions cannot hold one database transaction across several API calls.

## Decision

- **Every financial, production and period mutation is a database command**: service, advance, expense, purchase, reserve allocate/use, contextual rule decision, owners' decision, approve, annul, confirm payment, close, reopen, and later corrections.
- **One command = one database transaction**, including its idempotency journal entry, review-revision change, business history and security audit.
- **Browser roles have no direct `INSERT`/`UPDATE`/`DELETE` on these tables.**
- **Privileged command functions may be `SECURITY DEFINER`** under this contract:
  1. EXECUTE revoked from `PUBLIC` and `anon`; granted only where intended;
  2. fixed, safe `search_path`; schema-qualified references;
  3. actor and tenant resolved server-side — never accept organization, acting person, permissions or verification state from the client;
  4. every client-supplied id checked against the actor's organization;
  5. authorization checked inside the function, including verification scope;
  6. invariants checked under the needed locks;
  7. caller RLS is **not** assumed to apply; the function's checks are the authorization; RLS is defence in depth where technically applicable;
  8. no dynamic SQL from client input;
  9. minimal return value within the caller's entitlement;
  10. stable domain error codes;
  11. non-command helpers in a schema not exposed to the API;
  12. negative authorization tests for every command.
- Low-risk operational writes (Stock state, plan, simple configuration lists) may be direct writes under RLS, with server-side history where required.

## Consequences

- Business rules live close to the data and are testable as SQL.
- Each command's security depends on following the contract; reviews and tests must check it.
- The frontend becomes simpler: commands are single calls with clear outcomes.

## Rejected alternatives

- **Direct table writes under RLS for financial records** — cannot enforce cross-row invariants, locks or idempotency in one place.
- **Edge Functions as the command layer** — no single transaction across calls; adds latency and a second runtime for core rules.
- **Invoker-rights commands only** — would require granting browser roles DML on financial tables.

## Deferred

- A dedicated function-owner role with forced RLS for defence in depth (evaluate at implementation).
- Command signatures and final error catalogue.
