# ADR-0005 — Period lifecycle and review revision

**Status:** Accepted (Architecture Definition checkpoint, 2026-10-06)
**Related:** [Architecture Definition §11, §13](../architecture-definition.md#11-period-review-revision--concurrency-model) · 03 §2 · 04 J5 · Slice 06

## Context

The period states are decided: Aberto → Pronto para pagamento → Em pagamento → Fechado; payments may exist before Fechado; a period cannot close while approved amounts are unpaid; closed periods are not casually editable and reopening is traced (03 §2, 04 J5). Services, advances, expenses and decisions keep arriving while someone reviews the period, possibly on another device. Approval must not record figures different from those reviewed. A generic state/version number does not change when, for example, a new service is recorded.

## Decision

- **Explicit, persisted period state** with a transition log (actor, time, reason where required). Transitions only through commands. No scattered booleans.
- Transitions supported: approve, first confirmed payment, close; annul approval (designed in Slice 06; guard per product decision, 07 I4); reopen (reason required; target per product decision, 07 I3).
- **Review revision:** a monotonically increasing value per period.
  - **R-1** Every successful command that changes data capable of altering the period's review or approval results changes the revision in the same transaction (services, advances, expenses, purchases, reserve movements, contextual rule decisions, applicable standing-rule versions, owners' decision, approval, annulment, payments, close, reopen, later corrections).
  - **R-2** Review read models return figures and revision from one consistent snapshot.
  - **R-3** Approve, annul and close submit the reviewed revision; under the period lock a mismatch returns `STALE_REVIEW` and nothing is committed.
  - **R-4** Commands changing a period's revision or state serialize on that period.

## Consequences

- A concurrent capture during review forces a re-review instead of a silent mismatch.
- All period-affecting commands touch the period row; contention is expected to be negligible at salon scale and is measured.

## Rejected alternatives

- **Generic row version of the period** — misses changes to records that belong to the period.
- **Comparing recomputed totals at approval** — misses changes that leave totals equal but alter composition, and is costlier to reason about.
- **Locking the period during review** — blocks daily capture.

## Deferred (product)

*Update 2026-10-07:* the items below were decided by product in [07 D7](../../07_PRE_IMPLEMENTATION_GAP_CLOSURE.md#d7--close-rules-payments-approval-closing-records-after-approval-reopen) (records after approval rejected; annulment only before any payment; closing without an owners' decision warns; reopen target by payments). They were additive within this lifecycle; correction mechanics (07 I1) remain deferred.

- Whether records or corrections may enter a period after approval (07 I1, P11). Either answer (rejecting them, or surfacing a difference against the persisted approval outputs of ADR-0007) fits this lifecycle and the revision invariants, but may require additive schema, command, transition or constraint changes, not pre-designed here.
- Reopen target state (07 I3); annulment guard and approval granularity (07 I4); closing without an owners' decision (07 I5). Same position: not blocking; answers may need additive changes; boundaries unaffected.
