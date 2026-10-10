# 07 — Pre-implementation Gap Closure

**Canonical for:** the handoff from product/design into architecture: what V1 covers, which gaps were closed before architecture, which questions stay open and how much they block, the domain and financial invariants the approved design relies on, and the product-level authorization boundaries.

**Baseline audited:** `d21e9e4` — canonical docs [00](00_PRODUCT_CONTEXT.md)–[06](06_DESIGN_PRINCIPLES.md) and the six approved slices ([01](design/slice-01-hoje-registar-servico.md) · [02](design/slice-02-adiantamento.md) · [03](design/slice-03-despesa-compra.md) · [04](design/slice-04-situacao-profissional.md) · [05](design/slice-05-stock-preparar-compra.md) · [06](design/slice-06-fecho-periodo.md)).

**Status of this document.** Approved by Sollelio on 2026-10-06. The decisions in §2 (D1–D6) are `Decided`; the authorization boundaries in §8 are approved as the minimum product-level requirements (who holds each boundary stays open, §5.3 P1). Everything else follows the status vocabulary of [00](00_PRODUCT_CONTEXT.md#status-vocabulary-used-in-all-docs). This document does not choose a stack, an architecture, an auth mechanism or a data schema.

---

## 1. Gaps reviewed

| # | Gap | Source | Outcome |
|---|---|---|---|
| G1 | Reserve allocation has no capture journey; spending from the reserve is not representable | 03 §2 #8 · 04 J3 · Slice 06 §12 Q10, §19.1 | **Closed** — D1 (model + minimal interaction) |
| G2 | Retained / reinvested amount is a `Decided` money concept with no representation | 01 §2 · 03 §5 · Slice 06 §12 Q8, §19.2 | **Closed** — D2 (no separate V1 event) |
| G3 | Owner distribution: explicit record vs generic money movement | 03 §5 · Slice 06 §12 Q7 | **Closed** — D3 (explicit period-level decision record) |
| G4 | Remuneration rule shapes V1 must compute | 03 §2 #6, §3 · Slices 04, 06 | **Clarified** — D4 (no new behaviour) |
| G5 | MUST capabilities without a slice (people, catalogue, standing rules, settings, Dinheiro list) | 03 §2 | Not architecture-blocking; implementation-level (§4, §5) |
| G6 | Entry points for orphaned functions | 05 §1 · Slices 01–06 | §1.1 below |
| G7 | Open questions across all docs | all | Triage in §5 |
| G8 | Domain conflations | CLAUDE.md #9–#10 · 00 §5 · 01 §2 | §6 — no contradiction in money semantics; two wording findings |
| G9 | Equations, signs, double counting | Slices 02–06 | §7 — robustness rule for the excess **Decided** (D6); the cash-check candidate stays unapproved (incomplete) |
| G10 | Authorization boundaries the architecture must support | 05 §3–§4 · Slices 02–06 | §8 |
| G11 | Offline / connectivity | 05 §2 | **Closed** — D5 (online-required saving with retry; no offline engine) |

### 1.1 Entry-point and navigation audit

Every approved journey has a plausible entry point except the ones marked *needs definition*. Nothing here designs the Settings area.

| Function | Entry point today | Status |
|---|---|---|
| Record service (J1) | Hoje primary action (Slice 01) | Covered |
| Advance (J2) | Hoje quick action (Slice 02) | Covered |
| Expense / purchase (J3) | Hoje quick action → chooser (Slice 03); Stock → *Terminar e registar compra* (Slice 05) | Covered |
| Professional situation (J4) | Equipa → person (Slice 04); Fecho review sheets → *Ver situação completa* (Slice 06) | Covered; the **Equipa list** itself is not designed (trivial list → Slice 04) |
| Own situation ("A minha situação") | Hoje, Equipa or a personal device (Slice 04 Q8) | Open, not blocking (§5 P19) |
| Close (J5) | Hoje attention row → Fecho home (Slices 01, 06) | Covered |
| Stock (J6) | Hoje attention row; *Mais* tab (Slices 01, 05) | Covered |
| Contextual rule per period | Fecho → exception / review sheet (Slice 06) | Covered |
| **Standing (determinate) rule** — e.g. "70% · definida em 1 out" | None. Slice 04 displays it; no screen sets it | *Needs definition*: minimal entry under Definições → Pessoas (§5 I6) |
| Payment recording | Fecho → Pagamentos (Slice 06) | Covered |
| Owners' decision | Fecho → Posição → *Decisão dos sócios* (Slice 06 F8) | Covered |
| **Reserve allocation / use** | None (Slice 06 F6 shows the allocation as "captured elsewhere") | *Defined in D1*: Fecho → *Dinheiro do período* → reserve card |
| Corrections | *Corrigir este registo* (Slices 01–03 success) · ⋯ *Opções* (Slice 04 history) | Entry exists; **flow not designed** (§5 I1) |
| Reopen / decision history | Fecho closed home · clock icon (Slice 06) | Covered |
| Organization settings (name, logo, currency, people, catalogue, categories, methods) | Settings icon on Hoje (Slice 01 §3) | Entry exists; **content not designed** (§5 I6–I8) |
| Dinheiro timeline | Tab (Slice 01 §6); *Ver em Dinheiro* links (Slice 06) | Entry exists; **space not designed** (§5 I9) |
| Cash check (candidate) | Canvas only (Slice 06 C1) | Open candidate (§5 P5) |

Minimum entry points that must exist before the corresponding implementation, not before architecture: **Definições** (Organização · Pessoas e regras · Serviços · Categorias e formas de pagamento), the **Equipa list**, the **Dinheiro list**, and the **reserve card actions** (D1).

## 2. Decisions closed

All `Decided` (Sollelio, 2026-10-06).

### D1 — Reserve: one operational reserve, two records, no double counting

**Evidence.** 01 §3 `Confirmed`: the business keeps money for water, maintenance, paint, lights/electrical items and urgent needs; a reserve allocation is not necessarily an incurred expense; it still belongs to the business but is not freely distributable. 01 §2 / 04 J3 `Decided`: a reserve allocation is distinct from an expense. No evidence of several named funds, of moving money between funds, or of releasing reserve money back to the owners.

**Model.**

| Record | Meaning | Effect on the period's *Livre para decisão dos sócios* | Effect on the reserve balance |
|---|---|---|---|
| **Alocação à reserva** — amount, period, optional note ("para quê"), who confirmed, when | Business money earmarked for operational needs. Nothing is spent; no money leaves the business. Not an expense. | − amount (already in Slice 06 as *Reserva alocada*) | + amount |
| **Uso da reserva** — links one recorded expense or purchase, amount, who confirmed, when | That expense (or the salon's part of that purchase) was paid with money set aside earlier. It is **not** a new expense. | + amount (*Pago pela reserva*), because the cost already reduced *Livre* when the money was allocated | − amount |
| The expense / purchase itself (Slice 03, unchanged) | The real cost. Counted once, as today. | − amount (Despesas / Compras (salão)), unchanged | — |

- **One reserve per organization in V1.** Purpose is free text on the allocation. Several named funds are post-V1 (§5 X6).
- **Reserve balance** = Σ allocations − Σ uses, across periods. It does not reset per period. It is an earmark inside the business's money, not a bank account; where the cash physically sits is not modelled.
- **Integrity rule:** a use may not exceed the reserve balance at the time it is recorded, nor the expense amount or the purchase's salon part. Contributors' money is theirs and never comes from the reserve. This is arithmetic integrity (you cannot spend earmarked money that was never earmarked), not a business-judgement block, so it does not conflict with 06 #7. Whatever exceeds the balance simply stays an ordinary expense.
- **Which records may be marked as paid from the reserve:** expenses and the salon's part of purchases. Not advances, payments to the team or distributions (not evidenced).
- **Timing:** allocation and use are recordable while the period is *Aberto*, *Pronto para pagamento* or *Em pagamento*. They do not touch payables, so approval does not lock them. In a *Fechado* period only through authorized reopening; reopening therefore also unlocks the reserve records (an addition to what Slice 06 E4 lists).
- **Why "use" is a separate record, decided in the authorized context, and not a field in the Slice 03 capture:** it keeps the approved shared-device expense and purchase flows unchanged and fast. The reserve balance is never shown on the shared device. "Was this paid from the reserve?" is a funding decision made by whoever manages money, usually while reviewing the period. Capture-once still holds: the expense is captured once and the use only adds a decision to it. Recording the use at capture time is a possible later refinement (§5 P16).

**Worked example** (Slice 06 sample). October: allocation 20.000 → October *Livre* 60.000 (unchanged from Slice 06) and balance 20.000. November: a *Manutenção* expense of 9.000 is recorded (Slice 03) and then marked *Uso da reserva* 9.000. November's *Despesas* row includes the 9.000, a row *Pago pela reserva* +9.000 adds it back, November's *Livre* is unaffected and the balance is 11.000. Across both periods the 9.000 cost reduced owner-free money exactly once, in October.

**Minimal interaction** (smartphone, inside Fecho's private context; reuses Slice 02 *Confirmação necessária* and Slice 04/06 patterns; no new components):

1. **Reserve card** in *Dinheiro do período* (Slice 06 F6) now shows three facts with derivations — *Alocado neste período* · *Usado neste período* · *Saldo da reserva* — plus two secondary actions, **Alocar à reserva** and **Usar a reserva**. Tapping the card opens the reserve movements (allocations and uses, newest first, day-grouped, Slice 04 history pattern).
2. **Alocar à reserva:** one screen with an amount card (Slice 02), optional *Para quê* note, footer *Continuar* → *Confirmação necessária* (Valor · Período · Nota; lock note "Fica no histórico com data, hora e quem confirmou. Não é despesa; continua a ser dinheiro do salão, não distribuível.") → back to F6 with the card updated.
3. **Usar a reserva:** a pick list of this period's expenses and purchases (salon part shown) → amount prefilled with the lower of the record's amount (or salon part) and the balance, editable downwards → *Confirmação necessária* (Despesa/compra · Da reserva · Saldo depois). If the typed amount exceeds the balance, *Continuar* is disabled with "A reserva tem X; o resto fica como despesa normal."
4. **Posição do período** (F7) gains the row **Pago pela reserva** (+, only when non-zero), and the explanation (F7b) gains one step. *Livre* = produção − ganhos da equipa − despesas − compras (salão) − reserva alocada + pago pela reserva − acima do ganho. The closed summary (F14) includes the same row.

This is specified here as an addition to Slices 06 and 03's data, not as a redesign. The domain behaviour above is sufficient for architecture; the reserve UI details (boards, copy, layout) are designed during the implementation slice that builds the reserve feature (§5 I11), within this model.

### D2 — Retained / reinvested amount: no separate V1 event

**Evidence.** 01 §2: Fernando's rate is decided per period (70%, 50%, 25% or another value); he may lower it when owners take a distribution, and may voluntarily retain/reinvest part of what he could receive. 01 §3: in weaker months owners may take nothing and reinvest. 01 §7: how retained amounts are tracked today is unknown.

**Decision.** V1 has no "retained" or "reinvested" record. The behaviour is already represented faithfully:

| Behaviour | Represented by | Why it is faithful |
|---|---|---|
| A person on a **contextual (per-period) rule** leaves more money in the business | The rule chosen for the period (Slice 06 *Regra do período*), including a lowered or changed rule, with who and when in the decision history | Under 03 §3 (`Decided`) a contextual rule creates no entitlement before it is decided, so "what they could have received" is not a recorded fact. The amount left in the business is the difference the owners chose, and it appears in *Livre* and *Não distribuído*. |
| Owners take **no or a smaller distribution** | The owners' decision (D3); *Não distribuído* = livre − distribuição | The money stays in the business and is shown as undistributed. |
| Money is set aside **for a specific need** | Reserve allocation (D1) | Earmarked and not distributable, which is exactly the reserve concept. |

**Not representable in V1, and not evidenced:** a professional on a **determinate** rule who voluntarily leaves part of an amount already earned. Today a lower payment becomes *Parcial* and blocks closing (Slice 06 §8). If the pilot shows this happens, the candidate semantics are an explicit record *"Deixado no salão por <pessoa>"* that reduces remaining payable **without** reducing earned value and adds back to *Livre*. That is recorded as a pilot-validation question (§5 P14) and is not built.

The 01 §2 concept stays `Decided` as a concept; this decision fixes only its V1 representation.

### D3 — Owner distribution: explicit period-level decision record

Adopts Slice 06's proposal (§12 Q7): the owners' decision is an explicit record per period — *Sem distribuição* or an amount — with who and when, changeable until the period is closed and after that only through reopening. In V1 the recorded amount **is** the distribution. *Não distribuído* = *Livre* − distribution, signed and warned when negative (Slice 06 §6–§7). It is not a generic money movement, not a salary and not an expense.

Still open and not architecture-blocking (§5 P15): how and when the amount is paid out (method, date, from the reserve or not — not allowed under D1), and whether it is split per owner. Owner accounting stays out of V1 (03 §4).

### D4 — V1 remuneration rule shape (clarification of 03 §3; no new behaviour)

From 03 §3 and Slices 04/06: in V1 a person's remuneration rule is a **percentage of the person's own production in the period**, of one of two kinds:

- **Standing (determinate):** valid across periods until changed. Earned can be computed immediately (03 §3, J1).
- **Per-period (contextual):** decided for one period by an authorized person (Slice 06). Until then earned and payable are pending, shown as "—", never 0 (05 §7).

Earned = rule % × production, per person per period. The hair collaborator's purchase-cost share is **not** part of the rule. It is a purchase contribution recorded per purchase (Slice 03), à parte, with settlement open (03 §5). No other rule shapes (fixed amounts, tiers, per-service rates) are in V1. When a change to a standing rule takes effect is open (§5 I6).

### D5 — Connectivity (A1): saving requires a network connection

- Saving any record requires a network connection in V1.
- On a recoverable network or save failure, everything entered is preserved on screen and the person can retry (the "Erro ao guardar" states of Slices 01–03).
- **No** offline queue, offline persistence or sync engine, and no conflict resolution in V1.
- Offline / PWA sync may be revisited after pilot evidence on the salon's connectivity.

### D6 — Remaining payable and excess delivered (financial robustness rule)

Per person, per period:

```text
remaining payable          = max(earned − advances − confirmed payments, 0)
excess advanced / paid     = max(advances + confirmed payments − earned, 0)
```

- The first formula is the existing 04 J5 `Decided` clamp, unchanged.
- The second generalizes Slice 06's *acima do ganho* (Σ max(advances − earned, 0)). It gives identical figures in every state Slice 06 designs, and stays correct if earned value later falls below what was already delivered (for example after a correction).
- The excess is **a review condition only**. It is never classified automatically as debt, credit, remuneration, salary or receivable, and it is never netted against anyone. What to do with it remains the open advance policy (03 §5).
- While a contextual rule is pending, earned is undefined, so neither figure exists (03 §3).
- In the period position the excess is subtracted from *Livre* as its own term (*Acima do ganho · a rever*), because the money has already left the business (Slice 06 §7).

### D7 — Close rules: payments, approval, closing, records after approval, reopen

`Decided` (Sollelio, 2026-10-07), closing I2–I5 and the "records after approval" part of I1.

- **Partial payments (I2).** A payment may not exceed the person's remaining approved amount (blocked). A lower amount is recorded and the person shows *Parcial*; the period cannot close while anything approved is unpaid. Correcting a confirmed payment stays open (I1).
- **Approval and annulment (I4).** Approval is period-level, for everyone at once. It can be annulled (back to *Aberto*) only while no payment exists against it. A rule changes after approval only through that annulment.
- **Closing without an owners' decision (I5).** Warning only, never a blocker; the close statement and the history record explicitly that no decision existed.
- **Records after approval (I1, partial).** Once a period is *Pronto para pagamento* or *Em pagamento*, new services, advances, expenses and purchases in it are rejected; approved calculations never change silently. To change those inputs without payments, annul the approval first. With payments, the rejection stands until a correction flow exists (I1).
- **Reopen (I3).** Authorized (B8) with a mandatory reason. *Fechado* → *Em pagamento* if the period has confirmed payments, otherwise → *Pronto para pagamento*. Approval, payments, decisions, close statements and history stay as recorded; the reopen is its own history entry. Reopening makes the post-approval operations available again (owners' decision, reserve records, unconfirmed payments, annulment when no payment exists, closing again — which adds a new close statement); rules and approved amounts stay frozen.

### D8 — Pilot corrections, permissions and verification defaults

`Decided` (Sollelio, 2026-10-07), for the pilot; narrows I1 and settles the pilot values of 05 §3 and P1.

- **Cancellation (anular) of a mistaken service, advance, expense or purchase**, only while its period is *Aberto*: a person holding **`records.correct`** (B9), the exact one-shot verification, a mandatory reason, who and when. Nothing is deleted or edited in place: the original stays in the history marked *anulado* and stops counting in every active figure; the right record is captured again through the normal flow. Not in *Pronto para pagamento*, *Em pagamento* or *Fechado*. Correcting a confirmed payment and any post-approval correction remain open (I1).
- **Pilot permissions:** Fernando — `movement.confirm`, `team.finance.read`, `period.decide`, `period.close`, `period.reopen`, `records.correct`; Mercy — `movement.confirm`, `team.finance.read`, `period.decide`, `payment.confirm`, `records.correct`; everyone else none of these. Set as pilot data ([operations](operations/pilot-permissions.sql)), never in code.
- **Pilot verification defaults:** PIN of 6 digits; one-shot confirmation valid 2 minutes; private area 5 minutes; 5 wrong PINs per person or 10 per device within 15 minutes → 15-minute lockout.

### D9 — Business Health V1 (Negócio → Visão geral, Equipa, Serviços, Custos & Stock, Finanças): metrics, comparison, core insights, access

`Decided` (Sollelio, 2026-10-08, Business Health Slice 01 brief). Extends 03 §2 #12 (basic operational financial overview); not financial statements, not forecasting, not AI (03 §4).

- **Access (B11).** A private area: a verified private session of a person holding **`business.health.read`**. It shows business-level figures only — production, costs, result, Livre, the team's total approved-and-unpaid amount (except where one resolves to one person, below), trends and insights — never a person's remuneration, advances, payments or remaining amount, which stay behind `team.finance.read` (B4). Holding one does not grant the other. Pilot: Fernando, Mercy and Duart ([operations](operations/pilot-permissions.sql)).
- **Individual finance is not inferable (B11, Decided — Sollelio, 2026-10-09).** `business.health.read` lets owners see the business's financial health: aggregate team earnings, operating costs, operating result, retention, Livre and the unpaid team total stay visible to a viewer without `team.finance.read` wherever they cover several people. A figure is hidden, per period and per metric, only where it would resolve to one protected person. The test counts the people *other than the viewer* (the viewer knows their own figures): when exactly one other person earned, team earnings are hidden, and so are operating costs (= earnings + expenses + salon purchases), operating result (= production − costs), retention (= result ÷ production) and Livre (= result moved by the reserve and amounts above earned); when exactly one other person is still owed, "A pagar à equipa" is hidden. A hidden figure is also left out of every comparison, average and trend it would enter, and no insight, change line or driver is built from it. The screen shows "Não mostrado" and says why. A `team.finance.read` holder receives everything. The database applies this (hidden values are never sent); the permission model is unchanged. (Replaces the blanket withholding decided earlier the same day.)
- **Across periods (B11, Decided — Sollelio, 2026-10-09).** A viewer without `team.finance.read` must not be able to work out another person's remuneration or percentage exactly by combining Business Health responses across periods. With team earnings visible, a named per-person production in each period is one equation per period in each person's percentage, so such a viewer receives **no named per-person figures** in Business Health: no production, share, average ticket or comparison per person, and no service count per person either (where every service has one price, count × average ticket is the production). Equipa shows them the team as a whole: production, services, average ticket, active professionals and the unnamed distribution (largest and two largest shares, in whole percent), plus the concentration insight. The named rows stay for `team.finance.read` holders.
- **Metrics per period**, all from the Fecho calculation (ADR-0004; close statement for a closed period, ADR-0007; cancelled records never count): *Produção* = active services; *Custos operacionais* = team earnings + expenses + salon share of purchases; *Resultado operacional* = produção − custos; *Retenção operacional* = resultado ÷ produção × 100 (only when produção > 0); *Livre* = Fecho's own figure; *A pagar à equipa* = approved and still unpaid (none until approved). While a rule is pending, costs, result, retention and Livre are undefined ("—"), never 0.
- **Comparison.** Only against **closed** periods of comparable length (±25%): the immediately previous period (only if it is closed), and the average of the 3 most recent closed periods. A period still running is not compared. A zero reference gives a change in value, never a percentage. When a comparison is unavailable the screen says why.
- **Core insights (V1, deterministic, on demand, no stored insights)**, at most 5, action before attention:
  1. *Pagamentos aprovados por pagar* — any approved amount unpaid in this or an earlier open period (Ação necessária).
  2. *Período bloqueado* — an ended open period that cannot be approved because rules are still to decide (Ação necessária; grouped; a count, no names).
  3. *Produção sobe, resultado desce* — production ≥ +10% and result ≤ −5% against the previous closed period; lists the cost components that rose, without claiming cause (Atenção).
  4. *Descida de produção* — production ≤ −15% with at least 10 active services in the period (Atenção).
  5. *Categoria de despesa acima do habitual* — 3 previous closed periods; category present in ≥ 2 of them; ≥ 25% above their average; excess ≥ 3% of the period's production (Atenção; categories grouped; the explanation gives each category's share of production). Shown also on Custos & Stock.
  6. *Produção concentrada* (Slice 02) — one professional ≥ 40% of the period's production, or the two largest together ≥ 65% (whole percent, as the read model gives them, unnamed), with at least 3 active professionals (Atenção). Neutral wording about the business's structure ("68% da produção está concentrada em dois profissionais."); no names in the title, never framed as performance. Shown on Equipa and, by priority, among the overview's top 5.
  7. *Serviços concentrados* (Slice 03) — one service ≥ 35% of production, or the two largest ≥ 55% (whole percent, unnamed), with at least 5 different services performed (Informação; describes the distribution, does not call it good or bad).
  8. *Serviço em crescimento* (Slice 03) — a service's count rises in two consecutive comparisons (three comparable periods, chained by the comparison rule above), by ≥ 20% in all, from ≥ 5 records in the first period (Informação; several services grouped).
  9. *Serviço em queda* (Slice 03) — the same evidence for a fall (Atenção). It may suggest looking at demand, availability, price or promotion, and never claims a cause.
  10. *Compras do salão a subir* (Slice 04) — salon-funded purchases ≥ 25% above the previous comparable period and ≥ 5% of the period's production (Atenção; from a zero reference, no percentage and no insight). Lists the products with most salon-funded value, without claiming cause. On the overview it is left out when *Produção sobe, resultado desce* already names purchases as the largest cost increase (same story).
  11. *Produto a precisar de atenção* (Slice 04) — a product bought ≥ 3 times, or marked baixo/comprar ≥ 3 times, in the 30 days up to the period's end; both signals in one sentence, products grouped in one card (Atenção). It may suggest reviewing the usual purchase quantity or the pattern of use; it never claims consumption.
- **Negócio → Equipa (Slice 02).** *"How is the team contributing to the business?"* For every viewer, the team as a whole: production, services, average ticket, active professionals, the largest and two largest shares (unnamed), the concentration insight. For a `team.finance.read` holder only, per active professional (at least one active service in the period): services, production (active services, from the same Fecho position as the overview), average ticket (production ÷ services), share of the period's production, and the change in production against the previous comparable period (same rule as above; a professional with no production then gets a change in value, never a percentage; when unavailable, the reason). **Not a ranking and not payroll**: no positions, no "best"/"worst", ordered by production with neutral wording; no remuneration, advances, payments, remaining or excess for any viewer. A `team.finance.read` holder gets *Ver situação completa* into the existing person's situation (B4); a business-only viewer gets no finance action.
- **Thresholds** are V1 product defaults, kept in one place (`src/modules/business/thresholds.ts`; comparison rules in `private.business_health_config`).
- **Negócio → Serviços (Slice 03).** *"What are customers buying, what generates value, how is demand changing?"* Per service in the period (active records only, at the value recorded, not the catalogue price): count, revenue, average actual ticket, share of production; the same figures for the previous comparable period and the one before (for insights 8–9), with the change when valid (no percentage from a zero reference; the reason when unavailable). Summary: production, services performed, average ticket, different services. Sections *Mais receita*, *Mais realizados*, insights, *Distribuição da produção*; neutral order, no "best"/"worst". It shows what was bought and how it moved, **not marketing attribution, campaign return, acquisition source or social-media effect** (no such data). Never a professional or a per-person figure. For a viewer without `team.finance.read`, a service performed in the period by exactly one person other than the viewer is shown only inside *Outros serviços* (count and revenue together), and if that group would still be one other person's, the smallest service of two or more others joins it (B11: a specialist's production would otherwise be visible by service). A service's figures for a period are only returned under that period's rule. A `team.finance.read` holder sees every service.
- **Negócio → Custos & Stock (Slice 04).** *"Where are we spending, what is changing, which products deserve attention?"* Expenses by category (active expenses only): amount, share of expenses, share of production, previous comparable period and average of 3 (the overview's own references and rule), with their changes. Purchases: **only the salon-funded part counts** (purchase total − what people contributed, as Fecho counts it), its change against the previous period and share of production; per product, that part spread over each purchase's lines by cost, the number of purchases and the last one. Stock: Stock Lite as people set it — products in baixo/comprar/urgent/on the list now, and how often each was bought or marked in the last 30 days. **No quantities on hand, consumption rate or depletion forecast** (Stock Lite has none). No person, no contribution, no gross purchase total for any viewer: one minus the other would give a person's contribution.
- **Purchase contributions are not inferable (B11, Decided — Sollelio, 2026-10-09).** The shared-device Stock screen keeps each purchase's line cost (operational). Because the salon-funded part is the purchase total minus what people contributed, for a viewer without `team.finance.read` it is hidden in a period where those contributions come from exactly one person other than the viewer (the viewer knows their own). With it go every figure that contains it — operating costs, result, retention, Livre — and its share of production, per-product salon-funded values, comparisons, averages, trend values and the *Compras do salão a subir* insight. The screen shows "Não mostrado" and says the figure could reveal one person's contribution. With two or more other contributors the aggregate stays visible; a `team.finance.read` holder sees everything. The database applies this. A cancelled purchase is not a purchase anywhere: Stock's last purchase, purchase history and planned-quantity prefill read active purchases only.
- **Negócio → Finanças (Slice 05, Decided — Sollelio, 2026-10-10, Business Health Slice 05 brief).** *"How healthy is the business financially, what changed, and what is putting pressure on the result?"* The period's money in the product's own terms, **not an accounting statement and no "lucro"**: *Produção − Ganhos da equipa − Despesas − Compras (parte do salão) = Resultado operacional*; then, separately, the reserve, *Livre*, *Não distribuído* (Livre − the owners' decision), what was paid to the team against the approval and what is still to pay. Indicators: *custos operacionais ÷ produção* and *retenção operacional* (resultado ÷ produção), only when production > 0 and the figures are visible, with one plain sentence ("De cada 100 produzidos, 27,7 ficaram como resultado operacional, antes das decisões de reserva e distribuição"). Comparison, average of 3 and their reasons are the overview's (above); retention compares in percentage points. Trend: up to 6 recent periods of comparable length — production, result, retention, a hidden point marked "Não mostrado", never estimated. *Principais movimentos*: the largest changes against the previous comparable period among team earnings, each expense category and salon-funded purchases, only figures visible in both periods; they coincide with the change, they are not called its cause. Reserve: the current balance, what was allocated and used in the period (with the previous period's when comparable); **no target, no "healthy" or "too low"** (no such rule). Owners: whether the decision is recorded and Não distribuído; **never an amount per owner** (the model stores none). The finance insights (1–5, 10) are shown here in context; links into Fecho and payments only for a team-finance holder. Every figure comes from the same Fecho position (close statement for a closed period); cancelled records never count.
- **Finance figures are not inferable (B11, Slice 05).** The reserve figures make *Resultado − Livre − alocado + usado* the team's amount above earnings, so where exactly one person other than the viewer is above their earnings, Livre and Não distribuído are hidden. Paid + unpaid = team earnings − advances, so "Pago à equipa" is hidden where exactly one other person was paid or had an advance in the approval, and wherever the unpaid total or the team earnings are hidden. Não distribuído is hidden wherever Livre is. These apply in every Business Health read (overview included), with the same "Não mostrado" and reason; a `team.finance.read` holder sees everything.
- Open: the later Business Health area (Insights).

## 3. Gaps intentionally left open

None of these blocks architecture, provided the architecture follows §10:

- **Corrections** of recorded events (who, until when, how shown) — the entry points exist, the flow does not (I1). New records in an approved period are rejected (D7).
- **Configuration UIs**: people/ownership/capabilities, standing rules, service catalogue, categories, payment methods (I6–I8).
- **Dinheiro space** timeline (I9).
- **Contribution settlement**, **advance-excess policy**, **cash check**, **period length**, **self-recording**, **who holds each authorization** — pilot validation (§5).
- **Product name, accent and UI typeface** — Sollelio brand decisions; tokens are swappable (§5 P23).
- **Cash-check formula** (Slice 06 C1) — candidate, **not approved**: it is incomplete (§7 F-G5).

## 4. V1 MUST coverage matrix

Classification: **Covered** (approved slice/journey) · **Conceptual** (covered conceptually, no direct UI needed) · **Gap** (requires closure before architecture) · **Open** (intentionally open, not architecture-blocking).

| # (03 §2) | Capability | Class | Where / what remains |
|---|---|---|---|
| 1 | Organization and people/professionals | **Open** | Model `Decided` (00 §5). People appear in every slice (tiles, Equipa, Fecho). People/ownership/capability configuration UI not designed (I7). |
| 2 | Service catalogue | **Open** | Used by Slice 01 (frequent services, default price, editable per record). Catalogue management UI not designed (I8). |
| 3 | Completed-service recording | **Covered** | Slice 01; customer optional (`Decided`). Correction flow open (I1). |
| 4 | Payment method / value capture | **Covered** | Slices 01 (services, Misto), 02 (advances), 03 (expenses, Misto; purchases via contributors), 06 (team payments). Configurability open (P7). |
| 5 | Professional production totals | **Covered** | Slices 04, 06. |
| 6 | Configurable remuneration rules | **Covered** / **Open** | Per-period rules: Slice 06; display and explanation: Slice 04; shape clarified (D4). Standing-rule configuration UI open (I6). |
| 7 | Personal advances | **Covered** | Slice 02; above-earned warn-only (`Decided`); excess policy open (P4). |
| 8 | Business expenses / money movements (incl. reserve allocations, unexpected losses) | **Covered** + **Gap closed** | Expenses: Slice 03. Unexpected losses (e.g. compensating a customer) are expenses (Slice 06 sample "Outros · indemnização a cliente"). Reserve allocation **and use**: was a Gap, closed by D1. |
| 9 | Purchases and purchase contributions | **Covered** | Slices 03, 05 (multiple contributors, total level, zero salon share valid). Settlement open (P2). |
| 10 | Monthly close | **Covered** | Slice 06 (states `Decided`; close rules `Decided` in D7). |
| 11 | Amount payable per professional, explainable | **Covered** | Slices 04, 06; clamp `Decided` (04 J5). |
| 12 | Basic operational financial overview | **Covered** | Slice 06 *Posição do período*, extended by D1. Whether it is the number owners use: pilot (P13). |
| 13 | Stock Lite / replenishment visibility | **Covered** | Slice 05 (approved after correction). |
| 14 | History / audit trail | **Covered** / **Open** | Person history (Slice 04), close decisions (Slice 06), reserve movements (D1), attribution on every sensitive record. Corrections (I1) and the Dinheiro timeline (I9) open. |
| — | Organization settings (name, logo, currency, lists) | **Conceptual** / **Open** | Name + logo `Decided` (05 §6); currency as an organization setting is assumed in every slice; entry exists, content not designed (I6–I8). |

No MUST capability remains a **Gap** after D1.

## 5. Open-question triage

Deduplicated across 00–06 and Slices 01–06. Each question is in exactly one category. IDs are for reference only.

### 5.1 `BLOCKS ARCHITECTURE`

**None remain.** The only item, A1 (connectivity), was decided on 2026-10-06 (D5). Kept below for traceability.

| ID | Question | Sources | Why it blocked | Resolution |
|---|---|---|---|---|
| **A1** | **Connectivity / offline.** Must capture on the shared smartphone work without network (queue and sync later), or is V1 online-required? | 05 §2 (PWA/offline neither designed nor decided) | Offline-first vs online-required is a foundational architectural choice (data ownership on the device, sync, conflicts, identity of a queued confirmation). It cannot be retrofitted safely. | `Decided` (D5): saving requires a network connection; recoverable failures preserve the data and allow retry; no offline queue, persistence/sync engine or conflict resolution in V1; revisit after pilot evidence. |

### 5.2 `BLOCKS IMPLEMENTATION OF A SPECIFIC SLICE`

| ID | Question | Sources | Blocks |
|---|---|---|---|
| I1 | Correction of recorded events after approval, and of confirmed payments (pilot: cancellation in an open period — D8; new records in approved periods rejected — D7) | J1 · 05 §3 · Slices 01 Q3, 02 Q6, 03 Q8, 04 Q5, 06 Q14 | Correction flows (and corrections as Fecho exceptions) |
| I2 | ~~Partial payments / overpayments~~ — `Decided` (D7). Still open: correcting a confirmed payment (I1) | 03 §5 · J5 · Slice 04 Q1 · Slice 06 Q2 | — |
| I3 | ~~Reopen target state and what reopening unlocks~~ — `Decided` (D7) | 03 §5 · J5 · Slice 06 Q6 (+ D1 reserve records) | — |
| I4 | ~~Approval granularity and rule change after approval~~ — `Decided` (D7) | Slice 06 Q3 | — |
| I5 | ~~Closing without an owners' decision~~ — `Decided` (D7): warn only | Slice 06 Q5 | — |
| I6 | Standing-rule configuration: where it is set, and whether a change applies to the current period or from the next | Slice 04 Q9 · D4 | People/rule configuration |
| I7 | People, ownership and capability configuration; adding a new or temporary professional | 03 §2 #1 · Slice 01 Q6 | Definições → Pessoas; Equipa list |
| I8 | Service catalogue management; price visibility on the full Serviços list | 03 §2 #2 · 05 §4 · Slice 01 §8b | Serviços space |
| I9 | Dinheiro timeline: what is listed, filters, who sees contribution amounts afterwards | 05 §1 · Slice 03 Q7 · Slice 06 handoffs | Dinheiro space |
| I10 | *Livre* wording must say it is the **period's** free amount (not a cash balance) — copy check before implementing F7/F8 (§7 F-G3) | Slice 06 F7, F8 | Fecho position copy |
| I11 | Reserve UI details (boards, copy), designed within the D1 model during that implementation slice | D1 | Reserve feature only; the domain behaviour is defined |

### 5.3 `CAN REMAIN OPEN FOR PILOT VALIDATION`

Build with the flexible model in §10; gather evidence.

| ID | Question | Sources |
|---|---|---|
| P1 | **Who holds each authorization** (§8) in a given organization; whether a recipient may confirm their own advance; who sees attributions ("confirmado por", "definida por"); whether the confirmer may see the "above earned" relation | 03 §5 · J1 · J2 · 05 §3 · Slices 02 Q1, Q4–Q5, 03 Q1, 04 Q4, 06 Q1, §11 |
| P2 | Contribution scope ("relevant/global" purchases), settlement (at purchase or at close), treatment at close; whether external people may contribute; whether the *Salão* row is always offered | 01 §7 · 03 §5 · J3 · J5 step 4 · Slices 03 Q2–Q3, 04 Q3, 06 Q12, §18 |
| P3 | Contextual-rate timing and who decides it; the remuneration ↔ distribution circularity (V1 stance: two independent records, either order, no derivation between them — Slice 06 §6) | 01 §7 · 03 §5 · J5 · Slice 04 Q2 |
| P4 | Advance policy: whether a limit is needed; what happens to an excess above earned (carry-over, recovery, write-off, other); neutral notice for a pending rule at confirmation | 03 §5 · J2 · Slices 02 Q2, 04 Q6, 06 Q9 |
| P5 | Cash check / reconciliation flow (Slice 06 C1 candidate). The candidate formula is **not approved** because it is incomplete (§7 F-G5) | 03 §5 · 01 §4 · Slice 06 Q11 |
| P6 | Period length: always a calendar month? | 03 §5 · Slices 04 Q7, 06 Q13 |
| P7 | Payment-method set (configurable per organization?); mixed payments with more than two parts; Misto for advances | 03 §5 · Slices 01 Q5, 02 Q7, 03 §5 |
| P8 | Self-recording of services by professionals | 03 §5 · J1 |
| P9 | Shared-surface information: per-record prices on Hoje, salon-level counts, advances in *Recentes*, whether "pending" is sensitive, which sensitive exceptions appear on Hoje and to whom, stale stock reminders on Hoje | J1 · 05 §4 · Slices 01 Q1–Q2, 02 Q3, 05 Q1, 06 Q15 |
| P10 | Expense categories and an "Outros" sub-label; purchase origin set; unit words | Slice 03 Q4, Q9 |
| P11 | Event date vs registration date (bills recorded the day after payment; services recorded late) | Slice 03 Q11 |
| P12 | Zero-price services; confirm before *Sair sem guardar*; person reset after *Registar outro* | Slice 01 Q7–Q9 |
| P13 | Whether *Livre para decisão dos sócios* is the number owners actually use; whether a cross-period view of undistributed money is wanted | Slice 06 §18 |
| P14 | Voluntary retention by a determinate-rule professional (D2) | 01 §2 · D2 |
| P15 | Owner distribution payout (method, date) and per-owner split (D3) | Slice 06 Q7 · D3 |
| P16 | Reserve: release back to free money; whether the balance is wanted on the card; recording the use at expense capture instead of afterwards; how a later correction that would make the balance negative is surfaced | D1 · Slice 06 §19.1 |
| P17 | Stock follow-ups: post-purchase review offer, planned-quantity default, consumption signal, attribution of state changes, separate urgent purchases, new-product default state, catalogue hygiene | Slices 03 Q5, 05 Q1–Q8 |
| P18 | Navigation: five-slot tab bar with *Mais*; Stock as a tab | Slices 01 Q4, 05 Q8 |
| P19 | Self-view entry point | Slice 04 Q8 |
| P20 | Relative priority of problems; whether the patterns hold in other salons | 02 §1 · 01 §7 |
| P21 | Privacy of free-text notes | Slice 02 Q8 |
| P22 | Whether a rule decision should carry an optional reason (e.g. to label a lowered rule as retention) | D2 |
| P23 | Beauty OS product name, accent, lockup and UI typeface (Sollelio brand decision, not pilot; tokens are swappable) | 00 §1 · 05 §6 |

### 5.4 `POST-V1`

| ID | Question | Sources |
|---|---|---|
| X1 | Remembering known substitute products | 03 §5 · Slice 05 Q3 |
| X2 | Localization of space names and UI language for other organizations | 05 §1 |
| X3 | Products bought by weight or volume | Slice 03 Q6 |
| X4 | Tenant accent colour | 05 §6 |
| X5 | Several named reserve funds | D1 |
| X6 | One person belonging to several organizations (not evidenced; the architecture should not preclude it) | — |

## 6. Domain consistency findings

| Pair | Finding |
|---|---|
| Person vs role | Consistent. People are selected by name and capability; ownership is a separate mark ("Fernando (sócio)"); authorizations are attributed to individuals; nothing is modelled around one role. "Manager" in 04 means "anyone authorized" (04 preamble). |
| Service production vs payment received | Consistent. Production = Σ service values; the customer payment method only describes how that value came in (Misto must add up to the value). V1 has no unpaid or partially paid services. **Wording finding:** "pagamento" means a customer's payment method in Slices 01–03 and a payment *to a professional* in Slices 04/06. Different screens, no contradiction, but implementation copy and the domain glossary must keep them apart. |
| Earned remuneration vs advance | Consistent. Earned never changes with advances; the clamp is `Decided`; the excess is its own case (Slices 04, 06). |
| Payment vs advance | Consistent. Separate rows, filters and explanation steps (Slice 04); separate records (Slices 02, 06). |
| Contribution vs remuneration | Consistent in the design (à parte everywhere, never deducted). **Canonical tension, not contradiction:** 03 §3 lists "percentage split plus a share of material purchase costs" among remuneration cases, while the design keeps the share a purchase contribution with open settlement. D4 records this explicitly. |
| Purchase vs expense | Consistent. Two flows (Slice 03); separate position rows (Slice 06); only purchases feed Stock. |
| Reserve allocation vs expense | Consistent; D1 adds *use* without making either an expense. |
| Owner distribution vs service remuneration | Consistent. The owner-professional's earned value comes from his rule; the distribution is a separate owners' decision; no derivation between them (Slice 06 §6). |
| Purchase history vs exact inventory | Consistent after the Slice 05 correction. **Wording finding:** Slice 03 P4's lock note says the purchase "repõe os produtos no Stock". Physically true, but it can be read as the system changing stock state, which Slice 05 rules out. Recommend copy "fica no histórico dos produtos em Stock" when implementing (no slice doc rewritten). |
| Planned vs actual purchase | Consistent (Slice 05). |
| "Reserva" (two meanings) | Consistent naming: stock *em reserva · unidades por abrir* (Slice 05) vs financial *reserva* (Slice 06, D1). Neither appears on the other's surface. |

No remaining contradiction between money concepts.

## 7. Financial consistency findings

Signs are relative to the figure being explained (e.g. "−" for advances in a person's *Falta receber*, "−" for costs in *Livre*); records themselves carry an amount and a type, not a sign.

**Per person, per period**

| Quantity | Definition | Source |
|---|---|---|
| Production | Σ values of the person's services in the period | Slices 04, 06 |
| Earned | rule % × production; **undefined ("—"), not 0,** while a contextual rule is pending | 03 §3 · D4 |
| Advances | Σ advances in the period | Slice 02 |
| Confirmed payments | Σ payments confirmed in the period | Slice 06 |
| Remaining payable | `max(earned − advances − confirmed payments, 0)` | 04 J5 `Decided` |
| Excess advanced / paid | `max(advances + confirmed payments − earned, 0)` — a review condition only, never debt, credit, remuneration, salary or receivable | D6 `Decided` |

**Per period (organization)**

| Quantity | Definition |
|---|---|
| Ganhos da equipa | Σ earned (people with a defined rule; pending people named) |
| Despesas | Σ expenses |
| Compras (salão) | Σ purchase totals − Σ people's contributions; Σ contributors = total (Slice 03) |
| Reserva alocada / Pago pela reserva | Σ allocations / Σ uses in the period (D1) |
| **Livre para decisão dos sócios** | produção − ganhos da equipa − despesas − compras (salão) − reserva alocada + pago pela reserva − acima do ganho; "—" while any rule is pending |
| Não distribuído | livre − distribuição (D3) |
| A pagar à equipa | Σ remaining payable |
| Saldo da reserva (cross-period) | Σ allocations − Σ uses (D1) |

**Findings**

- **F-G1 — Robustness of the excess (Decided, D6).** Slice 06 defines *acima do ganho* as Σ max(advances − earned, 0). That is correct under Slice 06's rules, where payments cannot exceed the approved remainder, but would **omit** an excess created when earned falls after a payment (e.g. after a correction). The rule is now `max(advances + confirmed payments − earned, 0)`, a review condition only. It gives identical figures in every approved state; no slice screen changes.
- **F-G2 — Reserve double counting** is prevented by D1 (the expense counts once; the use adds back a cost already taken when the money was allocated; a use never exceeds the balance).
- **F-G3 — *Livre* is a period result, not a cash balance.** Money left undistributed in October is not carried into November's *Livre*, and V1 has no cumulative "money in the business" view (that would need opening balances, which is accounting territory). Owners may read *Livre* as available cash; copy must say "deste período" (I10). A cross-period view is a pilot question (P13).
- **F-G4 — Contributions.** Contributors' money never enters *Livre* or payables; only the salon part is a cost. If settlement is later adopted as a deduction from payable, the contribution must then become a reimbursement relationship; it can never be both à parte and deducted (P2).
- **F-G5 — Cash-check omission risk (candidate only).** The C1 expected-cash formula (cash services − cash advances − cash expenses − cash team payments) cannot include purchases (no payment method recorded), distributions (no payout method, D3) or reserve uses. It would misreport if adopted as is, so the formula stays **open and unapproved** (P5). It does not affect *Livre*.
- **F-G6 — Clamp and obligations.** "A pagar à equipa = ganhos − adiantamentos até ao ganho − pagos" (Slice 06) equals Σ clamped payable when payments never exceed the approved remainder; with D6 the two lenses stay equal in all cases.
- **F-G7 — Cash basis.** Purchases are a cost of the period in which they are recorded, as materials bought, not as consumption. This is operational, not accounting (03 §1, 01 §3). Consistent across Slices 03, 05, 06.
- **F-G8 — Approved amounts.** The approved payable per person must be kept as recorded at approval, not re-derived later, so any later difference (corrections) is visible against it rather than silently changing what was approved (§10).

No other place where money is double counted or omitted was found.

## 8. Product-level authorization boundaries

Minimum requirements the architecture must support. This is not RBAC, an auth flow or a mechanism. Ownership, roles and responsibilities stay independent (00 §5): an owner does not hold a permission because of ownership; an organization assigns each boundary to people, and one person may hold several.

| Boundary | Covers | Requirement |
|---|---|---|
| **B0 Organization / device context** | Everything | A device acts for exactly one organization at a time; no data crosses organizations (00 §3). |
| **B1 Ordinary operational capture** (shared device) | Record a service; prepare an advance, expense or purchase; mark stock state; prepare a list; market mode | No individual login per action (05 §3). Results show **no** sensitive financial information (05 §4). The current operator may change many times a day. |
| **B2 Sensitive movement confirmation** | Confirm an advance, an expense, a purchase (Slices 02–03 *Confirmação necessária*) | The confirming **person** is identified individually and recorded with time; the device alone is not enough (Slices 02–03 "quem confirmou"). Who may confirm is configuration (P1). |
| **B3 Own private view** | "A minha situação" | Only the person's own records; no attributions of colleagues (Slice 04 V1). |
| **B4 Manager / finance private view** | Any person's situation; Fecho; reserve balance | Sensitive figures appear only here (05 §4; *Privado*). |
| **B5 Period decisions** | Set or change a contextual rule; record the owners' decision (D3); allocate to or use the reserve (D1); approve payables; annul an approval | Individually attributed; recorded in the decision history (Slice 06 F15). |
| **B6 Payment confirmation** | Confirm a payment to a professional, possibly remotely (Slice 06; 01 §1) | Individually attributed; usable away from the salon's phone. |
| **B7 Close period** | Close | Individually attributed; blocked while approved amounts are unpaid (`Decided`). |
| **B8 Reopen** | Reopen a closed period | A stronger boundary than B7: mandatory reason; traced (04 J5 `Decided`; Slice 06 E4). |
| **B9 Corrections** | Correct a recorded event; anything in a closed period requires B8 first | History preserved; nothing silently overwritten (04 J1 `Decided`). Who and until when: I1. |
| **B11 Business health view** | Negócio → Visão geral: business-level figures, comparisons, insights (D9) | A verified private context of a `business.health.read` holder; aggregate business finance, the team as a whole (Equipa), service figures (Serviços), cost/stock figures (Custos & Stock) and the business's money (Finanças), but no named per-person figures, no purchase contribution, no individual remuneration (that is B4), nor a team figure that resolves to one person (D9). |
| **B10 Organization configuration** | People, ownership, capabilities, standing rules, service catalogue and prices, categories, payment methods, currency, name/logo | Changes to standing rules and prices are attributed and kept in history (03 §2 #14). |

Cross-cutting requirements:

- **Not merely hidden.** Sensitive financial information must not be delivered to an unauthorized context at all; hiding it in the interface is not sufficient (05 §4).
- **The private context does not pass to the next holder.** On the shared device, an authorized/private context must not remain open for whoever picks up the phone next (05 §4). The mechanism is architecture's to choose.
- **Every sensitive record carries who and when** (03 §2 #14), and its attributions are visible according to P1.
- **Personal devices later.** Identity is per person, so a future personal-device mode (05 §2 `Decided` compatibility) needs no change of model.

## 9. Readiness for architecture planning

**READY FOR ARCHITECTURE** (2026-10-06).

- **No architecture blocker remains.** A1 (connectivity) is decided (D5).
- **The money model is decided:** reserve (D1), retained amounts (D2), owner distribution (D3), rule shape (D4), payable and excess (D6). The authorization requirements are approved (§8).
- **Coverage:** every MUST capability is covered or deliberately open (§4).
- **Consistency:** no domain contradiction remains (§6), and the financial model is consistent (§7).
- **No further product-design work is required before architecture.** Each remaining question is per-feature (§5.2, designed in that feature's implementation slice, including the reserve UI), safe to build with the flexible model of §10 (§5.3), or post-V1 (§5.4).
- **Still open and not approved:** the cash-check formula (P5).

## 10. Requirements the architecture must respect (derived; no stack implied)

From canon and the approved slices, so the questions in §5.2–§5.3 can stay open safely:

1. **Records are append-only.** Corrections, rule changes, annulled approvals and reopenings are new records referencing what they change; nothing is deleted or silently overwritten (04 J1, J5; Slices 01–06).
2. **Derived figures are recomputed from records** (production, earned, payable, *Livre*, reserve balance, stock history), with three distinct kinds of stored data:
   - **source records** — immutable and reconstructable (services, movements, decisions, payments);
   - **approval outputs** — the approved payable per person and the decision records themselves, required by the product (F-G8);
   - **close-time financial outputs** — persisted at close **only** to preserve the historical meaning of a closed period if calculation implementations change ([Architecture Definition §14](architecture/architecture-definition.md#14-historical-financial-stability--audit-model)). They change no product behaviour and are not a ledger or event-sourcing requirement.
3. **Periods are explicit entities** with their own bounds and the four `Decided` states. Do not derive a period from the calendar month (P6).
4. **Each event keeps the date it happened separately from when it was recorded and by whom** (P11). Period membership follows the event date.
5. **Remuneration rules are versioned per person** (standing) with per-period contextual decisions (D4); *pending* is a first-class state, distinct from zero (03 §3).
6. **Money is stored with its organization's currency and precision.** One currency per organization; never hard-coded (00 §4). Amounts are unsigned with a type; signs are presentation.
7. **Organization-configurable lists**: payment methods, expense categories, purchase origins, unit words, services (P7, P10).
8. **Person dimensions are independent** (person, permission, ownership, responsibility, capability, rule — 00 §5); the boundaries in §8 are assignable per organization.
9. **Multiple payments per person per period** must be representable even if V1 forbids some cases (I2); remaining payable and the excess follow D6, and the excess is stored or derived as a review condition, never as a receivable or credit.
10. **Reserve** per D1: allocations and uses as records, use linked to an expense or purchase, balance derived, use ≤ balance.
11. **Shared-device model** per 05 §3–§4 and §8: device context, current operator, individually attributed sensitive confirmation, private context that does not carry over.
12. **Connectivity** per D5: online-required saving; recoverable failures keep entered data and allow retry; no offline queue, local persistence/sync engine or conflict resolution.
