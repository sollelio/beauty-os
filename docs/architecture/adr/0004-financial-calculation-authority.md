# ADR-0004 — Financial calculation authority in PostgreSQL

**Status:** Accepted (Architecture Definition checkpoint, 2026-10-06)
**Related:** [Architecture Definition §10](../architecture-definition.md#10-financial-calculation-authority) · 03 §3 · 04 J5 · 07 D1, D4, D6

## Context

The same figures are shown to users and used to enforce invariants: approval outputs, the payment cap, the close check, the reserve cap. Two implementations (SQL and TypeScript) would drift. Previews ("Se confirmar X%", Slice 06) must match what the command will record. Every number must be explainable (06 #4).

## Decision

- **PostgreSQL is authoritative** for production aggregates, earned, remaining payable, excess advanced/paid, team earnings, salon part of purchases, reserve terms, *Livre*, *Não distribuído*, reserve balance, and review/readiness conditions — using the canonical formulas (03 §3, D1, D4, D6; pending rules give "—", not zero).
- **One implementation per formula** in the owning module's calculation layer, used by read models, previews and commands.
- **Previews are read-only database queries** evaluating the same calculation with hypothetical inputs.
- **No authoritative formula in TypeScript.** Client-side checks (sums of mixed parts and contributions, the *Salão* remainder convenience, formatting) are for UX and are repeated by commands.
- The cash-check candidate formula is not approved and is not implemented (07 P5).

## Consequences

- Previews need a round trip; acceptable under D5 (online-required).
- Calculation changes are versioned (ADR-0007).

## Rejected alternatives

- **Shared TypeScript calculation package used by frontend and Edge Functions** — enforcement would still need SQL under locks, creating two sources.
- **Client-side previews** — risk of showing a figure the command will not record.
