# CLAUDE.md — beauty-os

Working rules for Claude Code sessions in this repository.

## Current phase

**Product / solution discovery.** There is no application code.

No frontend framework, backend, database, auth provider, hosting platform, architecture or design system has been chosen. Do not pick, propose as settled, or scaffold any of them unless explicitly asked.

## Canonical documentation

Read the relevant docs **before** proposing any change, design or plan.

| File | Canonical for |
|---|---|
| [docs/00_PRODUCT_CONTEXT.md](docs/00_PRODUCT_CONTEXT.md) | Product identity, vertical, pilot, multi-tenant direction, domain modelling principle, status and evidence vocabulary |
| [docs/01_DISCOVERY_SUMMARY.md](docs/01_DISCOVERY_SUMMARY.md) | What we learned from the pilot (evidence) |
| [docs/02_PROBLEM_AND_PRIORITIZATION.md](docs/02_PROBLEM_AND_PRIORITIZATION.md) | Problem areas, problem statement, product wedge, core transformation |
| [docs/03_V1_SCOPE.md](docs/03_V1_SCOPE.md) | What is and is not in V1 |
| [docs/04_CORE_USER_JOURNEYS.md](docs/04_CORE_USER_JOURNEYS.md) | The six core journeys |
| [docs/05_PRODUCT_EXPERIENCE_MODEL.md](docs/05_PRODUCT_EXPERIENCE_MODEL.md) | Product spaces, device and operator model, shared-device privacy, remuneration determinacy display |
| [docs/06_DESIGN_PRINCIPLES.md](docs/06_DESIGN_PRINCIPLES.md) | Product experience principles |
| `docs/design/slice-NN-*.md` | Design-slice proposals (one per `/design` slice). Proposals, not decisions: they cite the canonical docs and list what they leave open. |

## Rules

### Product decisions

1. **Read canonical docs first.** Base proposals on them, and cite the doc and section you rely on.
2. **Do not silently redefine closed product decisions.** If a request conflicts with a canonical doc, say so, cite the conflict and ask before proceeding.
3. **Label every claim** as one of:
   - **Fact** — confirmed by pilot evidence (`Confirmed` in docs);
   - **Assumption** — taken as true for now without evidence;
   - **Hypothesis** — a product bet to validate (`Candidate / hypothesis`);
   - **New product decision** — something you are proposing; it needs explicit approval before it becomes `Decided`.
4. **Do not invent requirements.** If information is missing, record it as `Open / requires validation` rather than filling the gap.
5. **Do not expand V1 scope without explicit approval.** The exclusion list in `03_V1_SCOPE.md` is binding.

### Product constraints

6. **Mobile-first and shared-device are first-class constraints**, not later optimisations. See `05_PRODUCT_EXPERIENCE_MODEL.md`.
7. **This is a multi-tenant SaaS product, not bespoke pilot software.** Never hard-code pilot names, percentages (e.g. 50%, 70%), currency (Kz), one country's rules or fixed service categories. Pilot facts are evidence for abstractions.
8. **Do not generalise prematurely** beyond the validated vertical (beauty salons, hair salons, barbershops, nail salons and closely related personal services).
9. **Person ≠ Role ≠ Ownership ≠ Operational responsibility ≠ Service capability ≠ Remuneration model.** Never model around a single `user.role`.
10. **Keep money concepts distinct** (service earnings, owner distribution, advances, retained/reinvested amounts, expenses, reserves, purchase contributions). Never collapse them into a generic "salary".

### Brand and identity

- **Sollelio owns the product experience; tenants contribute name + logo only** (05 §6). Never derive colours, typography, structure or interactions from a tenant's identity (including the pilot's logo).
- **The Beauty OS product accent, name and lockup are not chosen.** Treat any accent in a design slice as a provisional token. Do not create logo artwork or lockups; brand assets live in `sollelio-brand-assets/`.
- **One responsive web app**, not native (05 §2). Phone artboards are the mobile-web view.

### Way of working

11. **Work in small vertical / design slices.**
12. **Stop after the requested slice.** Report what was done and what remains open; do not continue into the next slice.
13. **Implementation must not begin until explicitly requested.**
14. **Use `/design` only when explicitly requested.** Any design output must respect the canonical docs; flag deviations instead of making them.
15. **Do not commit unless explicitly instructed.**

### Maintaining the docs

- Update the doc that owns a topic; cross-reference instead of duplicating.
- Moving an item to `Confirmed` requires a stated evidence source (pilot conversation, observation, additional business).
- Moving an item to `Decided` requires explicit approval from Sollelio.
