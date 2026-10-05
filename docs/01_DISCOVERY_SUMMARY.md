# 01 — Discovery Summary

**Canonical for:** evidence gathered from the pilot. This doc records what was learned; it does not define product scope (see [03](03_V1_SCOPE.md)).

Status tags: see [00 · Status vocabulary](00_PRODUCT_CONTEXT.md#status-vocabulary-used-in-all-docs). Unless marked otherwise, everything below is `Confirmed` pilot evidence. Amounts are in the pilot's currency (Kz) and are examples only.

---

## 1. Current operating workflow

- Professionals record their work manually in notebooks.
- Fernando keeps his own operational records.
- At month end, Fernando and Mercy review the notebooks, calculate each person's production, apply remuneration rules and process payments.
- When Mercy is not present, Fernando calculates totals and sends them via WhatsApp; Mercy processes payments remotely.

The same information may be recorded manually, duplicated, checked, recalculated, transferred via WhatsApp and reconciled at month end.

> Current: **reconstruct the month at month end.**

## 2. Remuneration

There is **no universal commission rule.**

| Case | Arrangement |
|---|---|
| Laurindo | Production split 50% professional / 50% business (e.g. 25,000 production). |
| Hair collaborator | Receives 70% of own production; business retains 30%. Also contributes 50% of relevant/global material purchases together with the salon. Works across hair and nail services. |
| Fernando | Contextual rate, decided per month by owners: e.g. 70%, 50%, 25% or another agreed value. May lower his rate when owners receive a distribution in a good month. May voluntarily retain/reinvest part of what he could receive, to address salon needs. |

**Personal advances.** Professionals can take advances during the month.

- Example: earned 50,000; advance 10,000; remaining payable 40,000.
- Currently recorded in both the professional's notebook and Fernando's notebook.
- A personal advance is **not** a business expense.

**Remuneration and cost responsibility coexist** (hair collaborator: earns a share of production *and* shares purchase costs).

### Money concepts the evidence requires distinguishing — `Decided`

Do not collapse these into a single "salary" field.

| Concept | Evidence |
|---|---|
| Service earnings | Professional's share of own production. |
| Owner distribution | Month-end reward to owners when affordable (§3). |
| Personal advance | Paid during the month; reduces payable; not an expense. |
| Retained / reinvested amount | Fernando voluntarily leaving part of his entitlement in the business. |
| Business expense | Money actually spent on the business. |
| Reserve allocation | Money set aside for operational needs; still the business's money (§3). |
| Purchase contribution | A person's share of a material purchase. |

## 3. Owner remuneration and business money

- Owners have **no fixed monthly salary**.
- At month end they assess performance and decide whether an owner reward/distribution is affordable without harming operations. In weaker months they may take nothing and reinvest.
- The business keeps operational/reserve money for e.g. water, maintenance, paint, lights/electrical items and urgent needs. **A reserve allocation is not necessarily an incurred expense**: it still belongs to the business but is not freely distributable.
- Unexpected losses/liabilities occur (e.g. compensating a customer for a lost item).
- The pilot's informal use of "profit" is **not** formal accounting profit.

## 4. Reconciliation

- Manual records occasionally disagree with physical cash or totals.
- Typical discrepancies are small (~1,000–3,000).
- Usual causes: a value skipped during calculation; something not recorded; cash miscounted.
- The team usually identifies the cause.

Reconciliation is a confirmed pain, but **not** supported as the standalone primary wedge (see [02](02_PROBLEM_AND_PRIORITIZATION.md)).

## 5. Stock and procurement

### Planning

- Planning is driven by the service catalogue and experience, **not** by strict reorder points.
- They estimate quantities to last about one month; often buy two units, or one larger container instead of several small ones; keep one unit in reserve when demand requires it. Shampoo/conditioner: one larger unit is often sufficient.
- Before the main monthly purchase they: (1) inspect stock; (2) estimate how long remaining product will last; (3) adjust quantities; (4) write a purchase list. If half a product remains and will last part of next month, they may buy one instead of two.

### Main purchase

- Fernando and the hair collaborator travel to the main market (~2–2.5 h, varies with congestion).
- The market is cheaper and used for bulk buying.
- Storage/climate quality at the purchase location matters to them because of heat.

### Emergency / local purchase

- When something runs out mid-month, Fernando or a delegate buys locally, preferably during low customer traffic.
- Running out has happened **many times** and can affect waiting customers.
- The team usually knows acceptable substitute products/brands and avoids being unable to perform a service.

### Consumption

- Products being used more than expected happens **frequently**.
- Fernando detects it through customer/service volume, expected consumption and operational knowledge; the team is small, so he can usually tell who used excess product.
- Not all internal use is waste: staff sometimes use products for their own grooming/presentation, which the business sees as having some marketing value.

Consumption types to distinguish conceptually — `Decided`:

- service consumption;
- authorised internal consumption;
- excessive / unnecessary consumption.

Expiry/spoilage is currently **low priority**.

## 6. Inferences from the evidence — `Candidate / hypothesis`

**Inferred**: product-team interpretation, not statements made by the pilot.

- Much of the business's operational and financial logic lives in Fernando's head and notebooks.
- Real-time supplier inventory / supplier marketplace is **not** a validated need: substitutes and local shops mitigate stock-outs.
- Month-end owner decisions (distribute, reserve, reinvest) are made without a consolidated view of the month.

## 7. Open questions from discovery — `Open / requires validation`

- Which purchases count as "relevant/global" for the hair collaborator's 50% contribution.
- How the collaborator's contribution is settled (paid at purchase time, or deducted at month close).
- Who decides Fernando's monthly rate, when, and how it interacts with the owner distribution decision (recorded as an unresolved business-rule question in [04 · J5](04_CORE_USER_JOURNEYS.md#j5--monthly-close)).
- How retained/reinvested amounts are currently tracked, if at all.
- Whether the patterns above hold in other salons/barbershops.
