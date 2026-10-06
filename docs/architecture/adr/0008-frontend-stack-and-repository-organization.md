# ADR-0008 — Frontend stack and repository organization

**Status:** Accepted (Architecture Definition checkpoint, 2026-10-06)
**Related:** [Architecture Definition §15, §19](../architecture-definition.md#15-frontend-architecture)

## Context

One responsive, mobile-first web application (05 §2, `Decided`) built with React and TypeScript and hosted on Netlify (constraints). Flows are short (1–3 steps); there is much server state; private contexts on a shared device must not leave sensitive data behind.

## Decision

- **Vite, React, TypeScript, React Router, TanStack Query, generated Supabase database types.**
- **No global state library and no form framework initially**; add one only for a demonstrated need.
- **Components never call the database client directly.** Each module exposes a deliberate access layer of typed queries and commands; commands carry `command_id` and, where required, the reviewed revision.
- **Sensitive query caches are removed** when a private shared-device context ends.
- No authoritative financial formula in the frontend (ADR-0004).
- Not in V1: PWA/offline sync (D5), i18n framework, notifications.
- **Repository:** one package —
  `src/app`, `src/spaces`, `src/modules` (`org`, `catalogue`, `services`, `team`, `purchasing`, `money`, `stock`, `period`), `src/shared`;
  `supabase/migrations`, `supabase/functions`, `supabase/tests`, `supabase/seed`; `e2e/`.

## Consequences

- Few dependencies; each has a stated reason (routing with deep links; server-state cache, invalidation and purge).
- Module access layers are the single place to review data access.

## Rejected alternatives

- **Global store (Redux/Zustand) for server data** — duplicates the query cache.
- **Form framework up front** — flows are small; validation is mostly server-side.
- **Monorepo tooling** — one package suffices for a small team.

## Deferred

- i18n implementation; error-reporting vendor; module-boundary lint rule.
