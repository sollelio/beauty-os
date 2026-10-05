# Design slice 03 — Registar despesa · Registar compra (shared smartphone)

**Status:** design proposal for review. Not a product decision; not an implementation spec.
**Canvas:** https://claude.ai/artifact/UaMG5Khy84jZvSW7A821s3 (private until shared)
**Baselines it extends:** [Slice 01](slice-01-hoje-registar-servico.md) · [Slice 02](slice-02-adiantamento.md) (HEAD `4c7d557`).
**Canonical inputs:** [01 §3, §5](../01_DISCOVERY_SUMMARY.md) · [03 §2 #8–#9, #13](../03_V1_SCOPE.md) · [04 J3, J6](../04_CORE_USER_JOURNEYS.md#j3--expense--purchase) · [05 §1, §3–§4](../05_PRODUCT_EXPERIENCE_MODEL.md) · [06](../06_DESIGN_PRINCIPLES.md)

Status tags as in [00](../00_PRODUCT_CONTEXT.md#status-vocabulary-used-in-all-docs). Everything here is `Candidate / hypothesis` unless it cites a `Decided` item.

---

## 1. Scope

Designed: the `Hoje → Despesa ou compra` chooser, the **expense** flow and the **purchase** flow (with purchase-level contributions and optional origin), their states, and the concise Stock Lite effect on success.

Not designed: the Dinheiro and Stock spaces, monthly close, reserve allocation, supplier anything, product catalogue management, post-save correction.

## 2. Two events, two flows

| | Despesa | Compra |
|---|---|---|
| Affects | business money | business money **+ Stock Lite** (+ contributions) |
| Fields | category · amount · payment method (Numerário / Transferência / Misto) · note | product lines (qty × unit, line cost) · total · who paid · origin |
| Steps | Categoria → Valor e pagamento → Confirmação | Produtos e total → Quem pagou e origem → Confirmação |
| Success | "Despesa registada com sucesso." | "Compra registada com sucesso." + "Stock actualizado: n produtos" |

They share the chooser, header contract, confirmation boundary, success and discard patterns, but never a form. Reserve allocation is **not** an expense category and is outside this slice (04 J3 `Decided`).

## 3. Rationale

| Problem | Response |
|---|---|
| One quick action on Hoje, two different events | A bottom sheet **"O que quer registar?"** with two large options whose descriptions give the operator the test to apply: *despesa* — "Contas e gastos do salão — não entra no stock"; *compra* — "Produtos que usamos nos serviços e ficam no stock". One tap, no new Hoje layout. |
| Operating expense in seconds | Category tiles (5, 2-column, organization-configurable; "Outros" catches the rest) → one screen for amount + method + note → boundary → success. Same amount card and segmented control as Slices 01–02; **Misto reuses the Slice 01 mixed-payment block** (Numerário + Transferência fields, live sentence "Soma X. Faltam Y para chegar aos Z.", *Continuar* disabled until they reconcile). |
| Market purchase without accounting knowledge | **One line per product**: pick from the catalogue or type a new name; a −/+ quantity stepper with the product's own unit word ("garrafão", "frasco", "caixa"); **one cost per line** — "Quanto pagou por estas unidades" (hint: "Total desta linha, não o preço de cada unidade"). After each add the sheet stays open on the search stage with "X adicionado · Terminar", so a 10-product purchase is not 10 reopenings. The running **Total** and the *Produto* / *Continuar* buttons are pinned in the footer. **Tapping a line reopens it for correction** ("Guardar alteração"); picking a product already on the list (shown as "já na compra · 2 × garrafão") opens that line instead of duplicating it; this also covers products created during the same purchase. |
| Why line cost, not unit price | At the market a lot is negotiated as a whole ("3 frascos por 7.500"); receipts show line totals; no division, no rounding, and the purchase total is a plain sum. Unit cost can be derived later where useful. |
| Units differ per product | The unit is a word on the product, not a system of measures. New products default to "unid."; the catalogue holds the word. No universal inventory-unit model. |
| Unlisted product | Typing a name offers **"Criar produto novo: «nome»"** below any matches (never for blank or one-character input; "Sem resultados para «x»" when nothing matches); a new product asks for its unit word (chips: unid., frasco, garrafão, caixa, tubo, pacote) before quantity and cost. The purchase proceeds and the catalogue grows. |
| Multiple contributors (01 §2: the hair collaborator shares material costs) | **Quem pagou?** at purchase level: a *Salão* row is always **offered** as a convenience, its amount **the remainder, computed automatically** (grey, "o resto, automático") until the operator edits it; **"+ Outra pessoa contribuiu"** adds a team member by name with an editable amount — typing 8.500 for Nádia makes Salão 15.000 with no further edit. **A zero salon contribution is valid**: if a person covers the whole total the Salão row reads 0 with "não contribui", the record holds only that person, and success says "pago por Nádia". The three cases — salon pays all, split, another person pays all — are all representable; nothing assumes the business contributes. No per-line splits. No 50/50, no fixed names. |
| Contributions must reconcile | Live sentence under the rows: "Soma X. Faltam Y para chegar ao total." / "Excede o total em Y." / "Indique quanto pagou N ou remova a linha." (a person added without an amount is never silently dropped) / "Pronto para confirmar." *Continuar* is disabled until the sum equals the total. Nothing inconsistent is accepted silently; no debt or settlement rule is stated. |
| Origin is useful but optional | Segmented **Onde comprou (opcional)**: Mercado · Loja local · Outro; tappable to deselect. No supplier records. |
| Money leaves the business | Both flows end on **Confirmação necessária** (Slice 02 pattern): full movement card, lock-icon note, one primary button. Mechanism not designed. |
| Recoverable failure (Slices 01–02) | Error banner on the confirmation screen, data preserved, *Tentar novamente* primary, *Sair sem guardar* via the discard sheet. |
| Leaving with typed data | × leaves directly when nothing was entered; otherwise the discard sheet ("Descartar esta compra?" / "…despesa?"). |

## 4. Flows

### Despesa
| Step | Screen | Key elements |
|---|---|---|
| 0 | Chooser | *Registar despesa* |
| 1 | **Que despesa?** (D1) | Tiles: Água · Electricidade · Renda · Manutenção · Outros, each with a hint; progress 1/3. |
| 2 | **Quanto e como?** (D2) | Category chip (tap to change); amount card *Valor pago*; segmented *Forma de pagamento* Numerário / Transferência / **Misto** (Misto reveals two fields + live sum sentence; E6 shows the blocked incomplete state); *Nota (opcional)*; footer summary + **Continuar**. |
| 3 | **Confirmação necessária** (D3) | Despesa / Valor / Forma de pagamento / Nota; note "Fica no histórico com data, hora e quem confirmou. Conta como despesa do salão em Dinheiro."; **Confirmar despesa**. |
| 4 | **Sucesso** (D4) | Neutral; recap; **Voltar a Hoje** primary, *Registar outra despesa* secondary. |

### Compra
| Step | Screen | Key elements |
|---|---|---|
| 0 | Chooser | *Registar compra* |
| 1 | **O que comprou?** (P1) | Line list (tap a line to correct it; trash to remove); footer: line count + **Total**, **Produto** (add) and **Continuar** (disabled when empty). |
| 1b | **Adicionar produto** sheet, stage 1 (P2) | Search-or-type field → catalogue matches (with "em falta" hint where Stock Lite flags it) → *Criar produto novo: «nome»*; after an add, "X adicionado · Terminar". |
| 1c | Stage 2 (P2b) | For a new product, unit chips; stepper; *Quanto pagou por estas unidades*; *Adicionar à compra* / *Guardar alteração*. |
| 2 | **Quem pagou?** (P3, P3b) | Total at top; *Salão* row = automatic remainder until edited (0 and "não contribui" when someone else pays everything — P3b); *+ Outra pessoa contribuiu* → name chips (with *Cancelar*) → new row; live sum sentence; *Onde comprou (opcional)*; footer summary + **Continuar**. |
| 3 | **Confirmação necessária** (P4) | Produtos / Total / Quem pagou / Onde; note "...Entra em Dinheiro e repõe os produtos no Stock."; **Confirmar compra**. |
| 4 | **Sucesso** (P5) | Neutral; recap derived from the saved rows ("3 produtos · 23.500 Kz · Salão e Nádia" / "pago pelo salão" / "pago por Nádia"); concise **Stock actualizado: 3 produtos**; **Voltar a Hoje** primary. |

States on the canvas: E1 despesa sem valor, E2 compra sem produtos, E3 contribuições ≠ total, E4 erro ao guardar, E5 descartar, E6 despesa misto incompleto. The prototype covers both flows end to end (*simulateSaveError* tweak shows E4).

## 5. Payment methods

Numerário, Transferência and Misto — the three methods the canonical docs list (03 §2 #4, 04 J1). Misto on an expense reuses the Slice 01 interaction unchanged; the two components must equal the expense value before *Continuar* enables. Configurability of the method set remains open (03 §5). Purchases do not capture a method separately from the contributions.

## 6. Stock effect

On a confirmed purchase each line is **recorded against its product in Stock Lite** (new products are created on the way). The success screen states only "Stock actualizado: n produtos" — no levels, no forecasts, no depletion dates. Whether a purchase clears a human-set "em falta" mark, and how levels are represented, are **Stock-space decisions left open** (§9); the prototype does not change Hoje's attention line. The Stock space itself is not designed.

## 7. Privacy handling

- Shown: contributor names and their contribution amounts, the purchase total, products. These are the record.
- Never shown: anyone's earnings, payable, remuneration %, balance, or what a contribution means for them later. The contribution is recorded as its own financial concept (03 §2 #9); the design makes **no** claim that it reduces payroll or is reimbursed.
- Neither flow writes to Hoje's shared *Recentes* in the prototype; where expenses and purchases are listed (Dinheiro) is outside this slice. The salon-level attention count is operational, not personal.

## 8. How this extends Slices 01–02

Reused: header contract (1/3–3/3, bars), amount card, segmented control, chip, key/value movement card, Confirmação necessária screen, error banner, discard sheet, neutral success, success-footer rule (one-off movement → *Voltar a Hoje* primary), all tokens, Instrument Sans (provisional).

New patterns proposed for the baseline:
1. **Chooser sheet** — a bottom sheet with 2 large option rows for one quick action that forks.
2. **Line list with pinned running total and footer add button** (P1); lines are tappable to correct.
3. **Add-item sheet in two stages** (pick/type → unit if new, quantity + cost), staying open between adds.
4. **Contributor rows with an automatic remainder row and live reconciliation** (P3/P3b) — the mixed-payment sentence pattern generalised to n contributors; the remainder row is a convenience, not a required contributor.
5. **Optional segmented context** that can be deselected (origin).

## 9. Open questions (`Open / requires validation`)

1. **Is an operating expense a sensitive action?** 05 §3 leaves the sensitive set open. This slice puts both flows behind *Confirmação necessária* for consistency (money leaves the business). If routine expenses should be recordable by any operator, D3 becomes a plain review step.
2. **Who may be a contributor.** Team members only (as designed), or also external people? And is the *Salão* row always present?
3. **Contribution settlement.** Deliberately not modelled (03 §5). The design records the split and nothing else.
4. **Expense categories.** The five shown are pilot-plausible; the set is organization configuration. Whether "Outros" needs a free-text sub-label is open.
5. **Product catalogue hygiene.** New products created from a purchase may duplicate existing ones with different spelling; merging belongs to Stock, not this flow.
6. **Quantity for bulk/loose goods.** The stepper assumes countable units; a product bought by weight or volume would need a different entry. Not evidenced in the pilot; left out.
7. **Where expenses/purchases appear** (Dinheiro timeline, Hoje recents) and who sees contribution amounts afterwards.
8. **Correction after registration** — same open item as Slices 01–02.
9. **Origin set** (Mercado / Loja local / Outro) — organization configuration or fixed? The option is labelled "Mercado" everywhere; "mercado principal" is pilot language, not the product label.
10. **Does a purchase clear an "em falta" mark?** J6 says a person marks an item low/out and that a recorded purchase updates Stock Lite; whether any quantity clears the mark automatically is for the Stock design.
11. **Date of payment vs date of registration.** Bills are often recorded the day after payment; the flow stamps the registration time. Whether a payment date is needed is open.

## 10. Assumptions

Sample data only (names, products, Kz). Whole-unit amounts, digits only. Units are words on products. The business row defaults to the remainder (the full total when nobody else is added) until edited; it is not required to be non-zero. Payment method for a purchase is not captured separately from the contributions (each contribution is money handed over; how each contributor paid is not asked). The Hoje count line counts services only.

## 11. Intentionally left out

Reserve allocation; VAT/tax; receipts/attachments; supplier profiles; unit prices; barcode/batch/expiry; per-line contribution splits; exact consumption; stock levels or forecasts; payment method per contributor; recurring expenses; correction flow; Dinheiro and Stock spaces.

## 11a. Review performed

A 5-lens multi-agent review (canonical, privacy, speed, craft, prototype logic) produced 45 findings, each tested by 3 adversarial verifiers; 17 survived and were fixed: contribution default reworked (Salão = automatic remainder; empty person row blocks with a message; success copy derived from the saved rows), product lines made correctable and the add sheet kept open between adds, add-sheet dead ends removed (trimmed query, no result cap, "Sem resultados", create option only for real input, unit chips for new products), stock-flag auto-clear removed from the prototype and recorded as open, "Mercado principal" → "Mercado", contributor rows restructured (label on the name, remove button as sibling, named aria-labels), P2 split into two boards, chooser copy, D1/D2 copy. 28 were refuted as taste, out of scope, or deliberately open. A second, narrower re-check of the rewritten prototype found 5 minor issues (duplicate new-product lines, disabled-state styling, "já na compra" cue, an impossible sample state, two generic aria-labels), all fixed.

**Correction pass (pre-baseline).** Two product issues were corrected without touching flow, layout or scope: (1) expense payment now offers Misto, reusing the Slice 01 mixed-payment block and validation (new state board E6); (2) the purchase contribution model is documented and demonstrated as *sum of contributors = total* with the Salão row as a convenience only — a zero salon contribution is valid and explicit (new board P3b, caption "não contribui").

## 12. Canonical tensions found

- 04 J3 says purchase contributions are "at total-purchase level" (`Decided`) — followed. It also says a purchase "updates Stock Lite" — followed, with the effect shown only as a one-line confirmation.
- Putting expenses behind the authorization boundary (Q1) is a design choice awaiting the open authorization model; it is not a new product rule.
