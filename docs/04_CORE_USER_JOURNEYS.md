# 04 — Core User Journeys

**Canonical for:** the six V1 core journeys.

Scope: [03](03_V1_SCOPE.md) · Spaces and device model: [05](05_PRODUCT_EXPERIENCE_MODEL.md) · Principles: [06](06_DESIGN_PRINCIPLES.md) · Status tags: [00](00_PRODUCT_CONTEXT.md#status-vocabulary-used-in-all-docs)

Journey steps are `Candidate / hypothesis` (to be validated with the pilot) unless marked otherwise. "Manager" means anyone authorized to act on behalf of others (in the pilot, Fernando).

---

## J1 — Record completed service

**Goal:** capture a completed service once, at the moment it happens.
**Space:** Serviços (quick action from Hoje).

Shared-device flow:

1. Start **Record service**.
2. Identify/select who performed it.
3. Select service.
4. Confirm or edit price.
5. Capture payment method: cash · transfer · mixed.
6. Show the consequence, within the viewer's authorization boundary (see rules below).
7. Confirm.
8. Production, remuneration and financial activity update.

Rules:

- On a personal device, step 2 may be inferred from the current operator.
- `Decided` Customer selection is **not** mandatory in V1.
- `Decided` Corrections preserve history/audit; nothing is silently overwritten.
- A professional may eventually record their own services; the manager can record on behalf of anyone.
- `Decided` **Remuneration display depends on determinacy** ([03 §3](03_V1_SCOPE.md#determinate-vs-contextual--pending-remuneration--decided)):
  - *Determinate*: the remuneration / business split may be calculated and shown immediately.
  - *Contextual / pending*: the service is recorded immediately; remuneration for that service/period is shown as **pending determination / not yet final**. No provisional calculation is presented as final.
- `Decided` **Shared-device privacy** ([05 §4](05_PRODUCT_EXPERIENCE_MODEL.md#4-shared-device-privacy--decided)): by default, recording a service shows a **neutral success confirmation**. The split (or pending status) appears only in an authorized/private context.

Open:

- Who may correct a recorded service, and until when.
- Whether the "pending" status itself counts as sensitive information.

## J2 — Personal advance

**Goal:** record money advanced to a professional against their earnings.
**Space:** Equipa (quick action from Hoje).

1. Select professional.
2. Enter amount.
3. Payment method.
4. Optional short note.
5. Show impact, limited to what the current operator is authorized to see.
6. Authorized person confirms.
7. Balance and monthly close update immediately.

Rules:

- `Confirmed` An advance is **not** a business expense.
- `Decided` The impact on earned and remaining balance is shown only within an authorized/private context ([05 §4](05_PRODUCT_EXPERIENCE_MODEL.md#4-shared-device-privacy--decided)). Otherwise the confirmation shows only what the current operator is authorized to see.
- Where the professional's remuneration is pending determination, the earned and remaining balance is not presented as final (J1).
- `Decided` If the advance exceeds currently earned value: **warn, do not block.** Leave it to authorized human judgement until a policy is validated.

Open: who counts as "authorized"; whether any limit policy is needed.

## J3 — Expense / purchase

**Space:** Dinheiro (purchases also feed Stock).

### Purchase

1. Add/select purchased products.
2. Quantities and values.
3. Total is calculated.
4. Record who contributed/paid — one or more contributors.
5. Confirm.
6. Financial view updates.
7. Stock Lite updates.

Rules:

- A purchase can have **multiple contributors**.
- `Decided` Do **not** force per-product contribution splits when the real rule is contribution at total-purchase level.

### Expense

1. Category.
2. Amount.
3. Payment method.
4. Optional note.
5. Confirm.

Rules:

- `Decided` A **reserve allocation is distinct from an incurred expense**.
- Expense categories are defined per organization, not fixed.

Open: which purchases a contribution rule applies to; whether a contribution is settled at purchase or at close ([03 §5](03_V1_SCOPE.md#5-open-scope-questions)).

## J4 — Professional situation

**Goal:** an explainable, current-period view of one professional.
**Space:** Equipa.

Shows:

- production;
- remuneration rule;
- earned value;
- advances;
- contributions, where relevant;
- payments;
- amount still payable;
- service history;
- financial history.

Rules:

- `Decided` Every important financial number answers **"Where did this number come from?"**
- `Decided` On a shared device, professionals do **not** automatically see other professionals' sensitive financial information. This view requires an authorized/private context ([05 §4](05_PRODUCT_EXPERIENCE_MODEL.md#4-shared-device-privacy--decided)).
- `Decided` Where remuneration is pending determination, earned value and amount payable are shown as not final (J1).

Open: exact visibility per person/permission.

## J5 — Monthly close

**Goal:** from *reconstruct the month* to *review and approve the month*.
**Space:** Fecho.

Period states:

```text
Open → Ready for payment → Payment in progress → Closed
```

1. Open current period.
2. See summary and exceptions.
3. Review professionals.
4. Resolve exceptional remuneration/contribution cases.
5. Review expenses, purchases and reserves.
6. Review operational financial position.
7. Approve amounts payable.
8. Finance (Mercy in the pilot) processes payments — possibly remotely.
9. Confirm payments.
10. Close period.

Rules:

- `Decided` Closed periods are **not** casually editable. Corrections and reopening require traceability.
- Replaces the current notebook review + WhatsApp hand-off ([01 §1](01_DISCOVERY_SUMMARY.md#1-current-operating-workflow)).

Open:

- What qualifies as an exception. Candidates derived from other journeys: advance exceeding earnings (J2), remuneration pending determination (J1), corrections, contribution cases (J3).
- **Unresolved business-rule question: remuneration ↔ owner distribution circularity.** Contextual service remuneration can depend on whether owners take a distribution. But whether a distribution is affordable depends partly on remuneration obligations. Pilot example: Fernando may lower his rate in a month when owners take a distribution. **Not solved yet. Resolve during the Monthly Close design/domain work.**
- Where owner distribution, retained/reinvested amounts and any cash reconciliation fit in the close ([03 §5](03_V1_SCOPE.md#5-open-scope-questions)).
- Exact transition conditions between states (e.g. partial payment).

## J6 — Stock / prepare purchase

**Goal:** know what needs buying, prepare the monthly purchase, and handle mid-month stock-outs.
**Space:** Stock.

Monthly purchase:

1. Review products needing attention.
2. Inspect approximate level / reserve status.
3. Prepare monthly purchase list.
4. Adjust quantities.
5. Use the list during the market purchase.
6. Record the actual purchase (J3).
7. Record purchase contributions.
8. Stock Lite updates.

During the month:

1. Mark item as low / out of stock.
2. Add to emergency replenishment.
3. Local purchase.
4. Record purchase (J3).
5. Stock updates.

Rules:

- `Decided` Do **not** pretend to have precise depletion forecasting without data. Levels are approximate and human-judged.
- Mirrors the pilot's practice: service-driven monthly estimate, reserve units, adjust for what remains ([01 §5](01_DISCOVERY_SUMMARY.md#5-stock-and-procurement)).
