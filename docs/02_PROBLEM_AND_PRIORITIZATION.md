# 02 — Problem and Prioritization

**Canonical for:** problem areas and their evidence basis, candidate problem statement, candidate product wedge, core transformation.

Evidence lives in [01](01_DISCOVERY_SUMMARY.md); scope lives in [03](03_V1_SCOPE.md). Status tags: see [00](00_PRODUCT_CONTEXT.md#status-vocabulary-used-in-all-docs).

---

## 1. Problem areas

Some problems were stated by the pilot; others are opportunities inferred from observed workflows. The **Basis** column keeps them apart, using the evidence labels defined in [00 · Evidence basis](00_PRODUCT_CONTEXT.md#evidence-basis) (Reported = stated by the pilot; Observed = supported by the described workflow; Inferred = product-team interpretation).

The Basis of each row is a product-team classification of the discovery notes, not a ranking or labelling made by the pilot. For **Observed** rows, the workflow is evidenced; whether the pilot experiences it as a pain is not yet stated.

| # | Problem area | Basis | Evidence | Status |
|---|---|---|---|---|
| 1 | Manual and duplicated records | Observed | Notebooks per professional + Fernando's records; advances recorded twice; WhatsApp hand-off ([01 §1](01_DISCOVERY_SUMMARY.md#1-current-operating-workflow)) | `Confirmed` practice; pain level `Open` |
| 2 | Complex and variable remuneration rules | Observed | Different splits, cost sharing, contextual rate ([01 §2](01_DISCOVERY_SUMMARY.md#2-remuneration)) | `Confirmed` |
| 3 | Fragmented operational/financial visibility | Inferred | Data spread across notebooks, memory and messages | `Candidate / hypothesis` |
| 4 | Dependency on Fernando's personal operational knowledge | Inferred | Fernando holds most roles and detection knowledge ([00 §4](00_PRODUCT_CONTEXT.md#4-the-pilot)) | `Candidate / hypothesis` |
| 5 | Manual reconciliation | Reported | Small discrepancies, cause usually found ([01 §4](01_DISCOVERY_SUMMARY.md#4-reconciliation)) | `Confirmed` pain; low severity |
| 6 | Excessive product consumption | Reported | "Happens frequently"; detected via Fernando's knowledge ([01 §5](01_DISCOVERY_SUMMARY.md#consumption)) | `Confirmed` occurrence |
| 7 | Unexpected stock depletion | Reported | "Many times"; affects waiting customers; mitigated by substitutes | `Confirmed` occurrence; severity moderated |
| 8 | Purchasing / logistics overhead | Observed | 2–2.5 h market trips; emergency local purchases | `Candidate / hypothesis` |
| 9 | Informal monthly decisions on what can be paid, reserved or reinvested | Observed | Owner distribution and reserve decisions at month end ([01 §3](01_DISCOVERY_SUMMARY.md#3-owner-remuneration-and-business-money)) | `Candidate / hypothesis` |

`Open / requires validation` The relative priority of these problems has not been ranked by the pilot, and none has been validated with additional businesses.

## 2. Candidate problem statement — `Candidate / hypothesis`

> The salon needs a single reliable source connecting completed services, professional production, remuneration rules, money movements and operational materials, so it can operate and make financial decisions without relying on multiple notebooks, memory and manual reconstruction.

Subject to validation; not an immutable truth.

## 3. Candidate product wedge — `Candidate / hypothesis`

> Operational and financial control for beauty/personal-service businesses where service revenue, professional remuneration and material consumption are directly connected.

Do not over-market or broaden this wording yet.

The wedge is **not**:

- online booking;
- generic POS;
- standalone payroll;
- generic inventory;
- supplier marketplace;
- standalone reconciliation (confirmed pain, but not supported as the primary wedge).

## 4. Core transformation — `Decided`

| | Flow |
|---|---|
| Current | record → remember → calculate → reconcile → interpret |
| Future | **capture once → calculate continuously → flag exceptions → review → decide** |

Capture business events as they occur instead of rebuilding the month at close: from *reconstruct the month* to *review the month*.

## 5. How V1 addresses the problem areas

Derived from the V1 scope in [03](03_V1_SCOPE.md); not an additional commitment.

| # | Coverage in V1 |
|---|---|
| 1, 2, 3, 9 | Direct: single capture of services, advances, expenses, purchases; configurable remuneration; monthly close. |
| 4 | Partial: rules and history move into the product; contextual judgement stays human. |
| 5 | Partial: capture-once and audit trail should reduce causes of discrepancy. A dedicated reconciliation flow is `Open` (see [03 §5](03_V1_SCOPE.md#5-open-scope-questions)). |
| 6 | Limited: Stock Lite gives visibility; no per-service consumption measurement in V1. |
| 7, 8 | Partial: products-needing-attention, purchase list preparation, emergency replenishment. |
