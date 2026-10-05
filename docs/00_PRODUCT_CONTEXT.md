# 00 — Product Context

**Canonical for:** product identity, target vertical, pilot relationship, multi-tenant direction, domain modelling principle, documentation status and evidence vocabulary.

Related: [01 Discovery](01_DISCOVERY_SUMMARY.md) · [02 Problem](02_PROBLEM_AND_PRIORITIZATION.md) · [03 V1 Scope](03_V1_SCOPE.md)

---

## Status vocabulary (used in all docs)

| Tag | Meaning |
|---|---|
| `Confirmed` | Fact supported by pilot evidence. |
| `Decided` | Explicit product decision already made by Sollelio. Change only with explicit approval. |
| `Candidate / hypothesis` | Current best bet; must be validated. |
| `Open / requires validation` | Unknown. Do not fill with invented answers. |

### Evidence basis

Used where it matters *where a claim comes from* (e.g. [02 §1](02_PROBLEM_AND_PRIORITIZATION.md#1-problem-areas)).

| Label | Meaning |
|---|---|
| **Reported** | Directly stated by the pilot. |
| **Observed** | Directly supported by the described workflow/behaviour. |
| **Inferred** | Product-team interpretation based on the evidence. |
| **Decided** | Explicit product decision already made by Sollelio (same as the `Decided` status). |

These labels are assigned editorially by the product team from the discovery notes. The pilot did not classify its own statements this way.

---

## 1. Company and product

- `Confirmed` Sollelio is a software company building multiple SaaS products.
- `Decided` This product is **distinct from Sollelio Events**. Do not reuse Events domain concepts.
- `Confirmed` `beauty-os` is the working repository name, **not** necessarily the commercial name.
- `Confirmed` Phase: product / solution discovery. No implementation, technology or architecture decisions have been made.
- `Decided` The product is **one responsive web application**, mobile-first, usable on smartphone, tablet and desktop/laptop — not a native iOS/Android app. Detail: [05 §2](05_PRODUCT_EXPERIENCE_MODEL.md#2-device-constraints-and-form-factor).

### Brand architecture — `Decided` (supplied by Sollelio)

Source: `sollelio-brand-assets/README.md` and the assets beside it (v0.1).

- Masterbrand **Sollelio**; existing product *Sollelio Events*; provisional product *Sollelio Workforce*.
- One unchanged master symbol across products; never redrawn per product. Product differentiation changes **only the accent plane** of the symbol — one controlled product accent per product.
- Master wordmark dominant; product descriptor subordinate. Lockup typography: Rubik (the README says "Regular"; the SVGs set the wordmark at weight 500 and the descriptor at 400).
- Palette: Mineral Indigo `#3030A8` (master) · Cobalt `#2457F5` (master accent) · Teal `#00A69A` (Events accent) · Amber `#D98A20` (Workforce accent) · Warm Graphite `#25272B` · Warm Off-white `#F7F4EE` · Midnight Indigo `#11152D` · White `#FFFFFF`.

`Open / requires validation` The Beauty OS **product name, product accent and `Sollelio <product>` lockup are not chosen**. They are later brand decisions, taken once naming is stable. Any accent used in a design slice before then is provisional ([05 §6](05_PRODUCT_EXPERIENCE_MODEL.md#6-product-identity-vs-tenant-identity--decided)).

## 2. Target vertical

`Decided` Initial vertical:

- beauty salons;
- hair salons;
- barbershops;
- nail salons;
- closely related personal-service businesses.

`Decided` Do **not** generalise into software for every service business.

## 3. Product direction

`Decided` A configurable **multi-tenant SaaS** usable by multiple businesses in the vertical.

Each organization will eventually need isolation of its members/users, professionals, services, remuneration settings, transactions, stock/products, settings and permissions.

`Open / requires validation` How tenancy, auth and data isolation are designed. Out of scope until explicitly requested.

## 4. The pilot

`Confirmed` One real salon, **Salão Agradável**, acts as pilot customer / design partner to discover the domain. Its logo (lime-green botanical monogram, transparent background) is a **tenant identity reference only**; it must not shape the product design system ([05 §6](05_PRODUCT_EXPERIENCE_MODEL.md#6-product-identity-vs-tenant-identity--decided)).

`Decided` The product must **not** become bespoke software for that salon.

> real pilot → real problems → correct abstractions → validation with additional businesses → configurable SaaS

`Decided` Pilot facts are **evidence for abstractions, not product rules.** Never hard-code:

- pilot names;
- percentages observed in the pilot (e.g. 50%, 70%);
- currency (Kz);
- one country's rules;
- fixed service categories.

### Pilot actors — `Confirmed`

Names appear in these docs only as discovery evidence.

| Person | Observed responsibilities |
|---|---|
| Fernando | Owner; operational manager; nail professional; barber; financial/reconciliation support; purchasing/procurement. Present in the salon; holds much operational knowledge. |
| Mercy | Owner; finance; payroll/payment processing; HR-like support. |
| Duarte | Owner; social media / marketing. Not regularly involved in daily finance. |
| Hair collaborator | Primarily hair professional; also performs nail and other beauty services. Distinct remuneration and cost-sharing arrangement (see [01 §2](01_DISCOVERY_SUMMARY.md#2-remuneration)). |
| Other professionals (e.g. Laurindo) | Perform services under differing remuneration arrangements. |

## 5. Domain modelling principle — `Decided`

> **Person ≠ Role ≠ Ownership ≠ Operational responsibility ≠ Service capability ≠ Remuneration model**

These are independent dimensions. One person may hold several of each (Fernando holds owner, manager, two service capabilities, finance support and purchasing at once), and they may change over time.

| Dimension | Question it answers |
|---|---|
| Person | Who is this individual? |
| Role / permission | What may they see or do in the product? |
| Ownership | Do they own (part of) the business? |
| Operational responsibility | What do they run day-to-day (e.g. purchasing, finance)? |
| Service capability | Which services can they perform? |
| Remuneration model | How are they paid for their work? |

Do **not** model the product around a single `user.role`.
