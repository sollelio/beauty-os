# 05 — Product Experience Model

**Canonical for:** primary product spaces, device constraints and form factor (responsive web), the operator/authorization model at product level, shared-device privacy, product identity vs tenant identity, and how remuneration determinacy is presented.

Journeys: [04](04_CORE_USER_JOURNEYS.md) · Principles: [06](06_DESIGN_PRINCIPLES.md) · Status tags: [00](00_PRODUCT_CONTEXT.md#status-vocabulary-used-in-all-docs)

This is a product model, not a UI design, navigation implementation or auth architecture.

---

## 1. Primary product spaces — `Decided`

```text
Hoje · Serviços · Equipa · Dinheiro · Stock · Fecho
```

Settings is secondary.

| Space | Purpose | Prioritizes | Avoid |
|---|---|---|---|
| **Hoje** | Operational command centre: *"What happened, and what requires my attention now?"* | Quick actions; today's activity; meaningful exceptions; concise operational figures | A dashboard full of charts |
| **Serviços** | Completed-service activity | Recorded services first; catalogue/configuration secondary | Leading with catalogue management |
| **Equipa** | Operational/financial situation of people | Production, earnings, advances, payable (J4) | Plain employee records |
| **Dinheiro** | Operational financial timeline and money movements | Expenses, purchases, reserves, movements in time order | Accounting-heavy terminology and structures |
| **Stock** | Products requiring attention | Attention list; approximate levels/reserve state; purchase preparation; history | Warehouse-style inventory |
| **Fecho** | Exception-driven monthly review | Exceptions; approval; payment; closure (J5) | Exhaustive line-by-line inspection |

### Journey → space

| Journey | Primary space | Entry from Hoje |
|---|---|---|
| J1 Record service | Serviços | Quick action |
| J2 Personal advance | Equipa | Quick action |
| J3 Expense / purchase | Dinheiro | Quick action |
| J4 Professional situation | Equipa | — |
| J5 Monthly close | Fecho | Exception / reminder |
| J6 Stock / prepare purchase | Stock | Attention items |

Entry points from Hoje are `Candidate / hypothesis`.

`Open / requires validation` Space names are in the pilot's language (Portuguese). Localization for other organizations is not decided.

## 2. Device constraints and form factor

- `Confirmed` The pilot has **one salon-owned smartphone and no laptop.**
- `Decided` Core operation must be **excellent on one shared smartphone**. This is a real constraint, not an edge case.
- `Decided` Compatible with a future mode where professionals use **personal devices**.
- `Decided` Desktop will be valuable later for management/financial review, but V1 core operation must **not** depend on a laptop.

### Responsive web application — `Decided`

> Beauty OS is one responsive web application, mobile-first, usable on smartphone, tablet and desktop/laptop.

- Phone artboards in design slices (e.g. [Slice 01](design/slice-01-hoje-registar-servico.md)) represent the **smartphone / mobile-web** experience of that one application, not a native app.
- Native-like mobile interaction patterns are acceptable and desirable **where they improve speed and usability** (stated by Sollelio with the decision). Which specific patterns are adopted (e.g. the bottom navigation and full-screen steps proposed in Slice 01) remains `Candidate / hypothesis` until validated.
- Tablet and desktop later **adapt layout and information density**; they do not merely stretch the mobile UI.
- Core operational workflows stay excellent on the smartphone regardless of larger-screen layouts.
- `Open / requires validation` PWA / offline behaviour is neither designed nor decided.

## 3. Operator and authorization model — `Decided` (concepts only)

Do **not** force repeated full login/logout on the shared device for ordinary actions.

Three distinct concepts:

| Concept | Meaning |
|---|---|
| Organization / device context | The device is authenticated as belonging to an organization. |
| Current operator | Who is acting right now (may change many times a day on a shared device). |
| Authorization for sensitive actions | Extra confirmation that the operator may perform this action. |

- `Candidate / hypothesis` Sensitive actions may use lightweight re-verification (e.g. a manager PIN).
- `Open / requires validation` Which actions are sensitive. Candidates from the journeys: confirming advances (J2), approving payables, closing and reopening periods (J5), correcting recorded financial events.
- `Open / requires validation` Auth architecture — not to be designed or finalized yet.

## 4. Shared-device privacy — `Decided`

> On a shared salon device, successful operational capture must not automatically reveal sensitive professional financial information to whoever is holding the device.

Concepts (no auth, PIN or RBAC design implied):

| Concept | Meaning |
|---|---|
| Current operator | Who is acting on the device now (§3). |
| Sensitive financial information | Detailed earnings, remuneration split, accumulated balance, or any other person's financial situation. |
| Authorization boundary | What the current operator, in the current context, is authorized to see. |

Consequences:

- Recording a service (J1) shows a **neutral success confirmation** by default.
- Recording an advance (J2) shows only the information appropriate to the current operator's authorization.
- Sensitive financial information requires an **authorized / private context**.
- Professionals do not automatically see other professionals' sensitive financial information (J4).
- *Show consequences immediately* ([06](06_DESIGN_PRINCIPLES.md) #2) still applies, but **only within the viewer's authorization boundary**.

`Open / requires validation` How the authorized/private context is established (mechanism not designed); how sensitive exceptions are presented on Hoje.

`Open / requires validation` **Per-record service prices on shared surfaces.** A service's price is catalogue information (the customer pays it), not remuneration. But a list of today's records with names and prices lets a device holder add up a colleague's daily production. Recommendation and the evidence needed to close this: [Slice 01 §8b](design/slice-01-hoje-registar-servico.md#8b-service-prices-in-recent-activity-on-the-shared-device).

## 6. Product identity vs tenant identity — `Decided`

Brand architecture and palette: [00 · Brand architecture](00_PRODUCT_CONTEXT.md#brand-architecture--decided-supplied-by-sollelio).

**Sollelio owns the product experience.** The following are product-system decisions, identical for every organization:

- interaction patterns and core workflows;
- typography;
- spacing, layout logic and information architecture;
- component system and structure;
- semantic colour roles (error, warning, success, information, selection);
- accessibility rules;
- overall visual/product character.

**An organization (tenant) may contribute controlled identity:**

- business name — V1;
- business logo — V1;
- `Candidate / hypothesis` a limited accent/brand colour — later, only if evidence requires it.

Tenant identity must **not** redefine semantic colours, typography, component structure, layout logic, accessibility rules or core interaction patterns. This is **not** a white-label system ([03 §4](03_V1_SCOPE.md#4-explicitly-not-v1--decided)). For V1, name + logo are sufficient.

Pilot reference: the Salão Agradável logo is a tenant asset. The application's colour system, typography, structure and interactions are not derived from it.

### Accent status in design slices

- `Open / requires validation` The Beauty OS product accent is **not chosen**. Any accent in a design slice is provisional until Sollelio decides it. Where the slice is to be reused as a baseline, the accent is a token to be swapped, not a decision. Current state: Slice 01 uses Sollelio master Mineral Indigo as a neutral placeholder ([Slice 01 §12](design/slice-01-hoje-registar-servico.md#12-visual-token-neutralization-pass-2026-10-05)).
- `Open / requires validation` The product UI typeface is not chosen. It is a separate decision from lockup typography (Rubik); Slice 01 uses Instrument Sans provisionally.
- Semantic colours (warning, error, success) are product-system tokens and must stay distinguishable from both the product accent and the other Sollelio product accents (Teal, Amber).

## 7. Remuneration determinacy in the experience — `Decided`

Rule: [03 §3](03_V1_SCOPE.md#determinate-vs-contextual--pending-remuneration--decided). Journey behaviour: [04 · J1](04_CORE_USER_JOURNEYS.md#j1--record-completed-service).

Within the authorization boundary:

- **Determinate** remuneration may be shown as a calculated split.
- **Contextual / pending** remuneration is shown as *pending determination / not yet final* wherever it appears (capture confirmation, Equipa, Fecho). A provisional figure is never presented as final.
