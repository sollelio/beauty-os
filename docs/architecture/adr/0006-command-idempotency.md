# ADR-0006 — Command idempotency with `command_id`

**Status:** Accepted (Architecture Definition checkpoint, 2026-10-06)
**Related:** [Architecture Definition §12](../architecture-definition.md#12-idempotency-model) · 07 D5

## Context

V1 is online-required: a failed save preserves the data and offers retry (D5). A transaction can commit while the client never receives the response; a naive retry would duplicate a service, an advance or a payment. Using an entity id as the idempotency key conflates two concerns and does not cover commands that create several entities or none (approve, close).

## Decision

- Every mutating command carries a **client-generated `command_id`**, distinct from any entity id, created once per user intent and reused for every retry of that intent.
- The first **successful** execution writes a **command journal** entry in the same transaction as its effects: `command_id`, command type, organization, principal, semantic-payload fingerprint, outcome, time.
- Replay with the same type, principal, organization and fingerprint returns the **original result**.
- Reuse with any of those different returns **`IDEMPOTENCY_CONFLICT`**.
- Concurrent duplicates resolve through journal uniqueness.
- Rejected commands roll back and are not journaled; the UI does not blind-retry domain rejections.
- Replay is answered only to the same principal and organization and never widens authorization.

## Consequences

- Retry after an ambiguous outcome is always safe.
- The client must keep the `command_id` with the preserved form data until success.

## Rejected alternatives

- **Entity UUID as key** — does not cover multi-entity or non-creating commands; conflates identity with intent.
- **Server-side de-duplication by content and time window** — can merge two genuinely identical services recorded minutes apart.

## Deferred

- Journal retention; whether journal entries are exposed as provenance (they are not the business history, ADR-0007).
