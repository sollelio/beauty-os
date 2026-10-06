# ADR-0001 — Modular monolith and module ownership

**Status:** Accepted (Architecture Definition checkpoint, 2026-10-06)
**Related:** [Architecture Definition §4–§5](../architecture-definition.md#4-domain--module-boundaries)

## Context

Beauty OS is a small-team product for small salons: one web application, one database, multi-tenant by organization (00 §3). The agreed direction is a modular monolith (constraint). The approved product has clearly separable concerns: people and settings, catalogue, service production, team money, purchases, business money, Stock Lite, and the period close. Several screens show data owned by other concerns (Hoje; reserve actions inside Fecho; Stock purchase history from purchases).

## Decision

- One deployable application and one PostgreSQL database.
- Eight domain modules: `org`, `catalogue`, `services`, `team`, `purchasing`, `money`, `stock`, `period`. *Hoje* is a read composition, not a module.
- **Each module owns its writes.** Only its own commands (or, for the listed low-risk cases, its own direct writes) change its tables.
- **Cross-module consumption is through published read contracts** (views or query functions). No module writes another module's tables.
- A command spanning modules belongs to one module and reads the others' contracts inside its transaction.
- **UI placement does not determine ownership** (e.g. reserve actions shown in Fecho are owned by `money`; payments belong to `period`).
- The frontend mirrors the boundaries (`spaces → modules → shared`).

## Consequences

- Boundaries are visible in both database and source tree without network calls between parts.
- Read contracts must be named and maintained; this is a small, explicit cost.
- Enforcement starts as convention plus review; tooling is added when a violation first occurs.

## Rejected alternatives

- **Microservices or separate deployables** — no evidence of need; adds distributed transactions to a domain that depends on atomic financial commands.
- **One undivided "app" folder and schema** — hides ownership of money concepts that the product requires to stay distinct (01 §2, CLAUDE.md #10).
- **Modules per product space** (Hoje, Fecho…) — spaces compose several domains; ownership would follow screens rather than data.

## Deferred

- Module-boundary lint tooling.
