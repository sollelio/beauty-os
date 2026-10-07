# 03 — V1 Scope

**Canonical for:** what is and is not in V1, and the open scope questions.

Journeys: [04](04_CORE_USER_JOURNEYS.md) · Experience: [05](05_PRODUCT_EXPERIENCE_MODEL.md) · Status tags: [00](00_PRODUCT_CONTEXT.md#status-vocabulary-used-in-all-docs)

---

## 1. Scope principles — `Decided`

- V1 is **operational financial visibility**, not accounting software.
- V1 does **not** attempt a universal remuneration rule engine. It supports the validated pilot cases **without hard-coding named people, percentages or currency**.
- Core operation must work on **one shared smartphone**; V1 must not depend on a laptop ([05](05_PRODUCT_EXPERIENCE_MODEL.md)).
- Everything is per organization (multi-tenant direction, [00 §3](00_PRODUCT_CONTEXT.md#3-product-direction)).
- No scope expansion without explicit approval.

## 2. Must-have candidate capabilities — `Candidate / hypothesis`

| # | Capability | Boundary / notes | Journey |
|---|---|---|---|
| 1 | Organization and people/professionals | People independent of role, ownership, responsibility, capability and remuneration ([00 §5](00_PRODUCT_CONTEXT.md#5-domain-modelling-principle--decided)). | — |
| 2 | Service catalogue | Defined per organization; no fixed categories. | — |
| 3 | Completed-service recording | Customer **not** mandatory. Corrections preserve history. | J1 |
| 4 | Payment method / value capture | Pilot: cash, transfer, mixed. | J1–J3 |
| 5 | Professional production totals | Per professional, per period. | J4 |
| 6 | Configurable remuneration rules | Sufficient for the validated cases in §3. | J1, J4, J5 |
| 7 | Personal advances | Reduce amount payable; not an expense. | J2 |
| 8 | Business expenses / money movements | Includes reserve allocations (distinct from expenses) and unexpected losses. Reserve allocation and use: `Decided` ([07 §2 D1](07_PRE_IMPLEMENTATION_GAP_CLOSURE.md#d1--reserve-one-operational-reserve-two-records-no-double-counting)). | J3 |
| 9 | Purchases and purchase contributions | Multiple contributors; contribution at total-purchase level. | J3, J6 |
| 10 | Monthly close | States as decided below; exception-driven review, approval, payment confirmation, closure. | J5 |
| 11 | Amount payable per professional | Explainable from its components. | J4, J5 |
| 12 | Basic operational financial overview | Not financial statements; informal "profit" ≠ accounting profit. | J5 |
| 13 | Stock Lite / replenishment visibility | Approximate levels, reserve status, attention list, purchase list, emergency replenishment. No forecasting. | J6 |
| 14 | History / audit trail | Corrections, reopening of closed periods, sensitive actions. | All |

### Period states — `Decided`

The close period moves through four states (UI labels in the pilot's language):

```text
Open (Aberto) → Ready for payment (Pronto para pagamento) → Payment in progress (Em pagamento) → Closed (Fechado)
```

- `Decided` Confirmed payments may exist before `Closed`: a payment is recorded when it is confirmed, while the period is *Ready for payment* or *Payment in progress*.
- `Decided` A period cannot become `Closed` while approved payable amounts remain unpaid.
- This is a product progression, not a technical state machine. Partial payments, approval annulment, closing without an owners' decision, records after approval and the reopen target are `Decided` ([07 D7](07_PRE_IMPLEMENTATION_GAP_CLOSURE.md#d7--close-rules-payments-approval-closing-records-after-approval-reopen)). Still `Open / requires validation` (§5): payment correction mechanics.

Design reference: [Slice 06](design/slice-06-fecho-periodo.md).

## 3. Remuneration cases V1 must support — `Confirmed` evidence

Expressed as patterns, not people. Evidence: [01 §2](01_DISCOVERY_SUMMARY.md#2-remuneration).

| Pattern | Pilot evidence |
|---|---|
| Fixed percentage split of the professional's own production | 50/50; 70/30 |
| Percentage split **plus** a share of material purchase costs | Hair collaborator: 70/30 + 50% of relevant purchases |
| Rate set per period by human decision | Fernando: 70%, 50%, 25% or other agreed value |
| Advances deducted from amount payable | Earned 50,000 − advance 10,000 = 40,000 payable |

### Determinate vs contextual / pending remuneration — `Decided`

A general distinction, independent of any named person:

- **Determinate remuneration** — the professional's rule is valid and known for the current period. The split can be calculated immediately.
- **Contextual / pending remuneration** — the rule depends on a later human decision for the period. The service is still recorded immediately, but its remuneration is **pending determination** and no provisional value is presented as final.

Pilot example of contextual remuneration: Fernando's per-period rate. Behaviour in the journeys: [04 · J1](04_CORE_USER_JOURNEYS.md#j1--record-completed-service).

### V1 rule shape — `Decided`

A V1 rule is a percentage of the person's own production in the period, either **standing** (valid until changed) or **per period** (contextual). Earned = rule % × production, per person per period. A share of purchase costs is recorded as a purchase contribution, not as part of the rule. No other rule shapes in V1. Detail: [07 §2 D4](07_PRE_IMPLEMENTATION_GAP_CLOSURE.md#d4--v1-remuneration-rule-shape-clarification-of-03-3-no-new-behaviour).

## 4. Explicitly not V1 — `Decided`

| Area | Excluded |
|---|---|
| Customers & marketing | Public online booking; customer app; advanced CRM; marketing automation; loyalty; memberships/packages |
| Suppliers | Supplier marketplace; supplier portal; delivery network; real-time supplier inventory |
| Finance & people | Full accounting; tax; formal payroll; full HR; attendance; shift scheduling |
| Stock | Advanced inventory forecasting; automatic purchasing; barcode scanning; exact per-service millilitre consumption; warehouse management; advanced expiry/batch workflows |
| Other | POS hardware; AI recommendations; full white-label / tenant theming beyond name + logo ([05 §6](05_PRODUCT_EXPERIENCE_MODEL.md#6-product-identity-vs-tenant-identity--decided)); native iOS/Android apps ([05 §2](05_PRODUCT_EXPERIENCE_MODEL.md#2-device-constraints-and-form-factor)) |

## 5. Open scope questions

All `Open / requires validation`. Do not resolve these by assumption.

- **Reconciliation / cash count.** Whether V1 includes an explicit cash-count or discrepancy flow, or only reduces discrepancies through capture-once. The Slice 06 candidate formula is not approved: it is incomplete ([07 §7 F-G5](07_PRE_IMPLEMENTATION_GAP_CLOSURE.md#7-financial-consistency-findings)).
- **Owner distribution payout.** `Decided`: V1 records the owners' distribution as an explicit decision record per period ([07 §2 D3](07_PRE_IMPLEMENTATION_GAP_CLOSURE.md#d3--owner-distribution-explicit-period-level-decision-record)). Still open: payout mechanics (method, date) and any per-owner split.
- **Retained / reinvested amounts.** `Decided`: no separate V1 financial event; the behaviour is represented by the per-period rule, the owners' decision and the reserve ([07 §2 D2](07_PRE_IMPLEMENTATION_GAP_CLOSURE.md#d2--retained--reinvested-amount-no-separate-v1-event)). Still open: whether a professional on a determinate rule ever leaves part of an amount already earned (not evidenced).
- **Contextual rate timing.** When and by whom a contextual per-period rate is determined. (What is shown before then is decided: see §3.) This includes the remuneration ↔ owner-distribution circularity recorded in [04 · J5](04_CORE_USER_JOURNEYS.md#j5--monthly-close).
- **Contribution scope and settlement.** Which purchases a contribution applies to; whether it is settled at purchase time or at close.
- **Advance policy.** Whether advances exceeding earned value need a limit (J2 currently warns only), and what happens at close to an amount advanced or paid above earned value: carry-over, recovery, write-off/absorption or another policy. (The payable clamp and the excess definition are decided: [04 J5](04_CORE_USER_JOURNEYS.md#j5--monthly-close).)
- **Authorization.** Who may confirm advances, approve amounts payable, close and reopen periods.
- **Payments within the close.** How a confirmed payment is corrected. (Partial and over payments, approval and annulment, closing and reopening are decided: [07 D7](07_PRE_IMPLEMENTATION_GAP_CLOSURE.md#d7--close-rules-payments-approval-closing-records-after-approval-reopen).)
- **Self-recording.** Whether professionals record their own services in V1 or only the manager records.
- **Payment methods.** Whether the set of payment methods is configurable per organization.
- **Period length.** Whether the close period is always a calendar month.
- **Substitute products.** Whether Stock Lite records known substitutes.
