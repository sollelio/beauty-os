# Architecture Decision Records

Context and cross-references: [Architecture Definition](../architecture-definition.md).

Status values: **Proposed** (not binding) · **Accepted** (binding) · **Superseded**. Deviating from an Accepted ADR requires an explicit superseding ADR.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-modular-monolith-and-module-ownership.md) | Modular monolith and module ownership | Accepted |
| [0002](0002-tenancy-and-rls-security-boundary.md) | Tenancy and PostgreSQL RLS as the security boundary | Accepted |
| [0003](0003-trusted-database-commands.md) | Trusted database commands for financial, production and period writes | Accepted |
| [0004](0004-financial-calculation-authority.md) | Financial calculation authority in PostgreSQL | Accepted |
| [0005](0005-period-lifecycle-and-review-revision.md) | Period lifecycle and review revision | Accepted |
| [0006](0006-command-idempotency.md) | Command idempotency with `command_id` | Accepted |
| [0007](0007-historical-financial-stability.md) | Historical financial stability and separate histories | Accepted |
| [0008](0008-frontend-stack-and-repository-organization.md) | Frontend stack and repository organization | Accepted |
| [0009](0009-shared-device-principal-and-verification.md) | Shared-device principal and verified actor | Proposed — **mechanism open, pending spike** |
