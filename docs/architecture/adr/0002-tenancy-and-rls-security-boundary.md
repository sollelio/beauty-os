# ADR-0002 — Tenancy and PostgreSQL RLS as the security boundary

**Status:** Accepted (Architecture Definition checkpoint, 2026-10-06)
**Related:** [Architecture Definition §3, §7–§8](../architecture-definition.md#8-authorization--rls-model) · 07 §8

## Context

The browser is untrusted. The product requires that sensitive financial information is not revealed to whoever holds the shared device (05 §4, `Decided`), that it is not merely hidden in the interface (07 §8), and that organizations are isolated (00 §3). The agreed stack is Supabase with PostgreSQL RLS as a real authorization boundary (constraint).

## Decision

- **Single database; every row belongs to one organization.** The organization is resolved from the authenticated principal, never from client input.
- **RLS is enabled on every table** and is the authorization boundary for reads; UI hiding is never authorization.
- **One actor-context resolution** (organization, principal kind, device, declared operator, verified actor, scope, expiry, grants) is shared by all policies and commands and evaluated once per statement.
- **Per-person permission grants** map to product boundaries B2–B10; no single role; ownership grants nothing by itself (00 §5).
- **Data sensitivity classes** (operational-shared, personal-financial, business-financial, period decisions, security/configuration) determine who may read; the device principal alone never reads a sensitive class.
- **Sensitive derived reads** use caller-rights views or actor-checked query functions, never owner-rights views that bypass RLS.
- **The service-role credential never reaches the browser.**
- Storage: one private, organization-prefixed bucket for logos.

## Consequences

- Every new table, view and function needs policies and RLS tests before use.
- Defaults are restrictive where product visibility is still open (e.g. contribution amounts after capture; full-list prices). The eventual product answers may require additive policy or schema changes; they are not pre-designed here and should not change the tenancy or RLS boundary.

## Rejected alternatives

- **Authorization in the frontend or an API layer only** — violates "not merely hidden" and makes the database an unprotected store.
- **Database per tenant** — operational overhead without evidence of need.
- **Single `role` column per user** — contradicts 00 §5.

## Deferred

- The concrete principal and verification mechanism (ADR-0009, spike).
