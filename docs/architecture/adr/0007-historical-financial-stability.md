# ADR-0007 — Historical financial stability and separate histories

**Status:** Accepted (Architecture Definition checkpoint, 2026-10-06)
**Related:** [Architecture Definition §14](../architecture-definition.md#14-historical-financial-stability--audit-model) · 04 J5 · 07 §10.1–10.2

## Context

A closed period is a reliable record (04 J5). Immutable inputs are necessary but not sufficient: if calculation code evolves, recomputing a closed period could silently change its meaning. The product also needs business history that explains outcomes, a security audit, and ordinary technical logs, which must not be confused.

## Decision

- **Source records** stay immutable and append-only.
- **Approval outputs** are persisted at approval: per person the approved figures (production, rule used, earned, advances counted, payments, remaining payable, excess) and the period totals shown, with the **calculation version** and approved **review revision**.
- **Close statement** persisted at close: the close-time financial output (per-person lines and period totals including *Livre*, distribution, *Não distribuído*, reserve terms) with calculation version and revision. A reopen leaves it intact; a later close adds a new one. **A closed period displays its latest close statement.**
- **Calculation version**: an explicit identifier changed whenever a formula's meaning changes.
- **Live derivation** for open periods, Hoje, Stock, current reserve balance, readiness and person situation of open periods.
- Recomputing a closed period may only **detect** divergence from its statement; it never overwrites it.
- **Three separate histories:** business history (the domain records, attributions, approval outputs, close statements, decision history), security audit (verification, bindings, grants, configuration changes, reopen), technical logs (operations only; no financial amounts, notes or personal financial data).

## Consequences

- Two kinds of output snapshot must be written atomically by approve and close.
- Formula changes require bumping the calculation version and adding tests showing closed statements unchanged.

## Rejected alternatives

- **Recompute closed periods indefinitely** — meaning can drift with code changes.
- **Accounting ledger / double entry / event sourcing** — beyond V1's operational scope (03 §1, 06 #10).
- **Technical logs as audit** — incomplete, mutable retention, and must not hold sensitive data.

## Deferred

- Tamper-evidence (hash chaining) of statements — only if evidence requires.
- Retention periods.
