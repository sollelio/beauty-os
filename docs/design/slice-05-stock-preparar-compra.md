# Design slice 05 — Stock Lite · Preparar compra (shared smartphone)

**Status:** design proposal for review. Not a product decision; not an implementation spec.
**Canvas:** https://claude.ai/artifact/CHocmuvf5bmA19mKD34qqB (private until shared)
**Baselines it extends:** [Slice 01](slice-01-hoje-registar-servico.md) · [Slice 02](slice-02-adiantamento.md) · [Slice 03](slice-03-despesa-compra.md) · [Slice 04](slice-04-situacao-profissional.md) (HEAD `dd9165b`).
**Canonical inputs:** [01 §5](../01_DISCOVERY_SUMMARY.md#5-stock-and-procurement) · [02 #7](../02_PROBLEM_AND_PRIORITIZATION.md) · [03 §2 #13, §4 Stock, §5](../03_V1_SCOPE.md) · [04 J3, J6](../04_CORE_USER_JOURNEYS.md#j6--stock--prepare-purchase) · [05 §2 Stock, §4](../05_PRODUCT_EXPERIENCE_MODEL.md) · [06 #2, #4, #7](../06_DESIGN_PRINCIPLES.md) · [Slice 03 §6, §9 Q10](slice-03-despesa-compra.md#6-stock-effect)

Status tags as in [00](../00_PRODUCT_CONTEXT.md#status-vocabulary-used-in-all-docs). Everything here is `Candidate / hypothesis` unless it cites a `Decided` item.

---

## 1. Scope

Designed: the **Stock** space home (attention-first list), the product sheet (approximate state, approximate level, stock reserve, list membership, urgent flag, last purchase), per-product purchase history, **Preparar compra** (the shopping list as a plan), **Modo mercado** (checking, quantity, substitution, unplanned item), the emergency-replenishment path, the handoff into Slice 03 *Registar compra*, and an **optional post-purchase stock review** that leaves the human-set state untouched unless a person changes it.

Not designed: inventory management, exact quantities or consumption, forecasting, supplier catalogues/portal/marketplace, delivery, warehouse, automatic purchasing, barcode, batch/expiry, product catalogue hygiene (merging duplicates), the Hoje layout (only its handoff), Slice 03 itself (replicated for the handoff only), authorization.

## 2. Model

Stock Lite is a list of **products as the salon names them**, each carrying only operational facts a person sets by looking at the shelf:

| Field | Meaning | Required |
|---|---|---|
| name, unit word, purpose | "Shampoo 5 L", garrafão / frasco / caixa / unid. (same unit words as Slice 03); purpose is an optional free word ("Cabelo") shown only in the product sheet | name, unit |
| **state** | `OK` · `Baixo` · `Comprar` — a judgement, not a measurement | yes (defaults OK) |
| **level** (approximate) | Cheio · Metade · Quase vazio · Vazio — optional words, never a number of millilitres. The row note is *level · n em reserva*, or the unit word when neither is set | no |
| marked at | the date a person set *Baixo*/*Comprar*; shown in the history sheet as "Marcado «baixo» · 4 out · 55 dias depois da compra"; cleared on *OK* | system |
| **em reserva** | count of **unopened units** on the shelf ("1 em uso · 1 em reserva") | no (0) |
| on list / planned qty / urgent | the current plan; qty prefilled from the last purchase, editable; *urgente* means "buy now, don't wait for the monthly trip" (where it is bought is Slice 03's optional origin) | no |
| **bought** (fact) | what the last recorded purchase delivered ("comprado hoje · 2 garrafão"), derived from the Slice 03 record; shown as context in the row note and the product sheet; **never changes state, level or reserve** | derived |
| last purchases | derived from Slice 03 purchase lines: date · qty × unit · line cost · where | derived |

Nothing decrements automatically. The only numbers are counts of units a person can see (reserve, planned quantity). "Reserva" here is always written **em reserva · unidades por abrir** and never appears near money, to keep it apart from the financial maintenance/emergency reserve (03 §2).

## 3. Rationale

| Principle / problem | Response |
|---|---|
| **Attention first** (05 §2 Stock: "Products requiring attention") | Stock opens on exceptions: *Urgente · comprar já* (dotted rows) → *Atenção* (Comprar before Baixo) → a collapsed *Em ordem · n* group. The one primary action is **Preparar compra · n produtos**. No table, no chart, no totals. |
| Honest approximation (04 J6 `Decided`: no precise forecasting; levels human-judged) | State is three words a person picks; level is optional words; reserve is a count of unopened units. A footnote on every Stock screen: "O estado é aproximado e marcado por quem vê o produto. Não há contagem automática." Nothing is computed from services. |
| "This is getting low; we should buy it" in one gesture | Product sheet: three 52 px segments (OK · Baixo · Comprar). Picking **Comprar** also puts the product on the list; the list toggle and an **Urgente** toggle sit beneath. Guardar closes. No numbers required. |
| Plan ≠ event (04 J3/J6; Slice 03) | The list screen says it in its first line: "Um plano para levar ao mercado. A compra real regista-se depois, com o que comprou de facto." Checking items in the market changes nothing in Dinheiro or Stock. The **Passagem** screen restates it ("Nada entra em Dinheiro nem em Stock até confirmar") and shows what will be carried and what was not bought. |
| Pilot practice: estimate, keep a reserve, buy less if enough remains (01 §5) | Each list row shows *resta: metade · 1 em reserva · última: 2 garrafão* above a *Levar* stepper prefilled from the last purchase, so lowering 2 → 1 is one tap with the reason in view. Products marked *Baixo* but not on the list are offered as *Marcados «baixo» · juntar?* — suggested, never auto-added. |
| Market use (busy, noisy, one hand) | **Modo mercado**: 72 px rows, 36 px circular check, 19 px name, 20 px quantity, a ⋯ per row for quantity / substitution / "Não comprei" (and "Voltar ao produto planeado" after a substitution), a progress counter "3 de 4" (skipped items leave the denominator), a dashed *+ Item não planeado*. Two groups: *Urgente · comprar já* and *Compra do mês*. The footer counts three buckets: *comprados · por comprar · não comprei*. Re-entering the market after editing the list rebuilds the trip from the current list, keeping progress on items still listed; *Terminar sem compra* ends an empty trip. |
| Substitution is a human decision (03 §5 open; brief) | ⋯ → *Não há · levei outro produto* → search-or-type sheet → the row becomes the substitute with "em vez de Shampoo 5 L" beneath; un-checking the row or *Voltar ao produto planeado* undoes it. The **substitute is the product on the purchase line**: it flows into Slice 03 under its own name and, on confirm, becomes (or updates) its own Stock product. The planned product keeps its own mark (only its list entry ends); nothing records the two as equivalent. |
| Emergency replenishment (04 J6 "during the month") | Product sheet → Comprar → *Urgente · comprar já*. Urgent items are the first group on Stock, on the list and in the market; the handoff reminds that an urgent item bought elsewhere or on another day may be a separate Slice 03 record. Where it is bought stays Slice 03's optional origin. No logistics. |
| **No silent clearing of "em falta"** (Slice 03 §9 Q10) — and no silent *keeping* either | Recording a purchase changes nothing in the human state: a product marked *Comprar* stays *Comprar* with the fact "comprado hoje · 3 frasco" beside it. Slice 03 P5 *Compra registada com sucesso* is reached **verbatim** (K7: heading, recap, "Stock actualizado: n produtos" pill, *Corrigir este registo*, footer *Voltar a Hoje* · *Registar outra compra*); for a purchase that started in Stock it carries one extra follow-up card — "O estado só muda se alguém o mudar" — with **Rever stock · n produtos** and *Voltar a Stock*. **Rever stock** (K7b) is optional: one row per product bought, segments OK · Baixo · Comprar pre-selected on the *current* state, tapping is the same human action as in the product sheet; *Concluir* is always enabled. Nothing blocks leaving, returning to Stock, or listing the product again. There is no "pending confirmation" state. |
| Purchase history without a ledger (reuse Slice 03) | Product sheet → *Última compra* line → sheet with the last purchases of that product: date, qty × unit, **line cost**, where. One observational line: *Marcado «baixo» 4 out · 55 dias depois da compra*. No who-paid, no contributions, no rates. |
| Consumption visibility (02 #7) | Only facts: days between last purchase and the *Baixo* mark, and the recent purchase dates. No "sooner than expected" judgement because there is no expected value to compare against (§8 Q4). |
| Hoje not redesigned | Hoje's Atenção row ("n produtos marcados a comprar") deep-links to Stock; the Stock header's house icon returns to Hoje. The Slice 03 success pill "Stock actualizado: n produtos" is kept unchanged; the follow-up card beneath it says what it means (purchase history, state untouched). |

## 4. Screens

| # | Board | Content |
|---|---|---|
| — | **Main** (interactive) | Full loop: Stock → product sheet → history → Preparar compra → Modo mercado (check, qty, substitute, skip, unplanned) → Passagem → Slice 03 P1 pre-filled → *Compra registada com sucesso* (P3/P4 implied, not repeated) → optional Rever stock → Stock, where states are exactly as before the purchase unless a person changed them. |
| K1 | **Stock · atenção** | Primary *Preparar compra · 3 produtos*; Urgente (Lâminas, vazio); Atenção (Shampoo 5 L, Gel — Comprar, list icon; Cera depilatória — Comprar with the fact "comprado hoje · 2 unid."; Condicionador, Tinta — Baixo); Em ordem · 4 collapsed; footnote. |
| K1b | **Stock · nada precisa de atenção** | Green "Nada marcado como baixo ou a comprar."; Em ordem expanded showing level/reserve notes ("cheio · 1 em reserva", "4 em reserva", unit word when nothing is set). |
| K2 | **Produto** (sheet) | Name · purpose · unit; Estado segments; Quanto resta? chips; Em reserva stepper (unidades por abrir); Na lista de compra; Última compra → Ver; Guardar. |
| K8 | **Compras · produto** (sheet) | Three purchases (date · qty · where · line cost); observational line; footnote "Quem pagou não aparece aqui." |
| K3 | **Lista de compra** | Plan sentence; Urgente · comprar já; Compra do mês rows (name + context line, remove ×; *Levar* stepper beneath); Marcados «baixo» · juntar?; + Outro produto; footer "4 produtos · 1 urgente" · **Ir às compras**. |
| K4 | **Modo mercado** | 3 de 4; Lâminas ✓; Shampoo 3 L ✓ *em vez de Shampoo 5 L*; Gel ✓; Condicionador unchecked; Tinta preta struck through (Não comprei); + Item não planeado; footer "3 comprados · 1 por comprar · 1 não comprei" · **Terminar e registar compra**. |
| K5 | **Substituir** (sheet) | "O que levou em vez? · Não há Shampoo 5 L"; search "shampoo 3" → Shampoo 3 L · Criar produto novo; note that the planned product stays marked. |
| K6 | **Passagem** | "Registar a compra real" explanation; *Vai para a compra* (with "em vez de" / "planeado · urgente"); *Não comprado · fica marcado em Stock* ("não comprei · planeado 2 tubo"); separate-purchase reminder for urgent items; **Continuar para Registar compra**. |
| K6b | **Slice 03 P1 pré-preenchida** | Slice 03 P1 as approved (lines with trash, footer *+ Produto* + *Continuar*); only additions: the indigo note "Pré-preenchido pela lista de compras…" and the "em vez de" meta on a substituted line; costs start empty ("custo por introduzir", Continuar disabled until all lines have one — prototype); board shows the completed state "3 produtos · Total 19.000 Kz" (then Slice 03 P3/P4 unchanged). |
| K7 | **Compra registada com sucesso** | Slice 03 P5 verbatim (recap "3 produtos · 19.000 Kz · pago pelo salão · Hoje às 13:05"; pill "Stock actualizado: 3 produtos"; *Corrigir este registo*; footer *Voltar a Hoje* · *Registar outra compra*) plus the *Stock* follow-up card: **Rever stock · 3 produtos** · *Voltar a Stock*. |
| K7b | **Rever stock (opcional)** | "Opcional. … Nada muda sozinho."; per product bought (Shampoo 3 L *em vez de Shampoo 5 L*, Gel, Lâminas) segments OK · Baixo · Comprar showing the state as it was; footer "2 produtos continuam marcados … como estava antes da compra." · **Concluir** → Stock. |

Key states covered: nothing needs attention (K1b); products low/to buy (K1); list prepared (K3); shopping in progress (K4); substituted product (K4/K5/K6/K7b); not bought / não comprei (K4/K6); purchase recorded with the human state unchanged (K1 Cera depilatória, K7b); empty trip (*Terminar sem compra*, prototype only).

## 5. Sample data (illustrative)

Eight products with the same names/units as Slice 03's sample purchase (Shampoo 5 L, Gel para unhas, Cera depilatória, …). Last purchases 12 set (Mercado) and 28 set (Loja local). Kz whole units. "Outubro", dates and product names are sample data, not rules.

## 6. Privacy handling

Stock is operational and is shown without a Privado badge. It shows no earnings, no contributions, no "quem pagou", no remuneration, no period totals. The purchase history shows **line cost** (the price paid for that product) because it is needed to plan the next purchase; it does not show the purchase total split or contributors. Contributions remain where Slice 03/04 put them (Dinheiro; the professional's private view).

## 7. How this extends Slices 01–04

Reused: tokens, Instrument Sans (provisional), capture-flow header, chip, segmented control, stepper, sheet, pick rows, dashed add button, footer with summary line + primary, neutral success, line-list rows from Slice 03 P1.

New patterns: **state pill** (OK green tint · Baixo white with the warning-marker stroke `#B7791F` · Comprar amber tint — no new colours); **market row** (72 px, circular check, large name and quantity, ⋯); **collapsed group header** (*Em ordem · n* with chevron); **optional stock-review follow-up** after a Stock-originated purchase.

Handoffs:
- **Hoje → Stock**: the existing Atenção row deep-links to K1; nothing else on Hoje changes.
- **Stock → Slice 03**: *Terminar e registar compra* → K6 (plan vs real) → Slice 03 P1 with lines pre-filled from the **checked** items only (substitute names, market quantities, **costs empty**), then P3 Contribuições and P4 Confirmação exactly as approved. Items can be removed/added there. The plan is not a record.
- **Slice 03 → Stock**: P5 *Compra registada com sucesso* is reached unchanged — P3 Contribuições and P4 Confirmação necessária run as approved between K6b and K7 (not re-drawn here). For a purchase that started in Stock, P5 carries one extra *Stock* follow-up card (Rever stock · Voltar a Stock); every P5 element and its footer stay as approved. Stock review is a follow-up action, never part of the financial transaction; a purchase recorded directly from Hoje shows P5 exactly as in Slice 03.

## 8. Open questions (`Open / requires validation`)

1. **Should stock-state review be offered after a purchase at all?** Proposed: the optional *Rever stock* follow-up on P5 for Stock-originated purchases. Alternatives: no follow-up (review only from Stock), or offering it for any purchase that touches a marked product. Whether Hoje should surface stale marks ("marcado Comprar · comprado hoje") as reminders is also open.
2. **Planned quantity default.** Prefilled from the last purchase line. Alternative: empty until the person sets it. Pilot validation.
3. **Substitute memory.** The design records "X em vez de Y" on that purchase only. Whether Stock should remember substitutes as a suggestion next time is 03 §5's open "Substitute products" item — left open.
4. **Consumption signals.** Only "marked low N days after purchase" is shown. Whether this is useful, and whether a comparison to previous intervals is honest enough, needs data from the pilot.
5. **Audit attribution for stock-state changes.** Any operator on the shared device can set states (no authorization boundary proposed). Whether a change should carry "marcado por X" like Slice 02's "confirmado por" is open.
6. **Urgent local purchase as a separate record.** K6 reminds the user; whether the list should split into two Slice 03 purchases automatically (one per origin) is left to the pilot's habit.
7. **Catalogue hygiene** (Slice 03 §9 Q5) remains open; this slice creates products from the list/substitution/unplanned sheets the same way Slice 03 does.
8. **Navigation**: Stock lives under *Mais* in the Slice 01 tab bar hypothesis; if the pilot uses Stock weekly, a tab may be warranted.

## 9. Assumptions

Sample data only. States are per product, not per unit. A product on the list but not bought stays on the list with its mark; a bought product leaves the list (the plan ended) but keeps its state. Unplanned items are matched to existing products by name; unknown ones become products when the purchase is saved. A new product created by a purchase starts as *OK* — the default for any newly created product, not a reading of the purchase (to validate). A substitute carries into Slice 03 under its own name with "em vez de" in the line meta and becomes its own Stock product when saved; the planned product keeps its state and leaves the list.

## 10. Intentionally left out

Exact quantities; automatic decrement from services; forecasting and reorder points; supplier catalogues/prices; barcode; batch/expiry; delivery; purchase approval; product categories management; multi-location; photos; per-service consumption; stock valuation; who-paid or contribution data in Stock.

## 11. Review performed

A 5-lens multi-agent review (canonical, privacy, speed/comprehension, craft, prototype logic) produced 39 findings, each tested by 3 adversarial verifiers; 24 survived (several duplicates) and were fixed: substitute products now enter Stock as the product actually bought and the confirm step asks for *their* state (the planned product keeps its own mark); a *Por confirmar* pill and "what arrived" note replace the stale Comprar/Baixo chip on bought-but-unconfirmed rows, and such products cannot be listed again until their state is set; market counts split into comprados / por comprar / não comprei with skipped items out of the denominator; shop items keyed by a stable id (costs and confirm choices no longer drift when checks change); the trip is rebuilt from the current list on each entry; substitutions can be undone (uncheck, *Voltar ao produto planeado*); unplanned items resolve to existing products by name; catalogue duplicates removed; *Terminar sem compra* for an empty trip; list rows stacked (name/context above a *Levar* stepper) so names no longer wrap beside four controls; per-row stepper labels; `role="img"` on the list icon; confirm rows stacked; progress slot no longer fixed-width; Baixo pill stroke moved to the existing warning marker; K6b restored to Slice 03 P1 (trash, *+ Produto*) with complete costs and K7's recap matching; group labels no longer bind urgency to a place. 15 were refuted as taste, deliberately open, or already handled (e.g. the Slice 03 contribution/confirmation steps are implied between K6b and K7, not removed; "55 dias depois da compra" is a fact, not an analytic).

A second, narrower re-check (prototype logic; board/prototype/doc consistency and canon) found 20 candidates, 12 of which survived 2 refuters and were fixed: the prototype now carries the handoff reminder, the history mark line ("Marcado «baixo» · date · n dias depois da compra", with the mark date recorded when a state is set and cleared on OK) and the "Quem pagou não aparece aqui" footnote; substitute-sheet copy aligned with the confirm behaviour (planned product keeps its mark); Atenção sorted Comprar before Baixo; urgent rows get dividers; unplanned items merge into an existing shop row for the same product, are removed by un-checking, and offer *Tirar das compras* instead of skip/substitute; re-entering the market no longer duplicates an unplanned item whose product was added to the list; the add sheet is titled *Adicionar produto* when opened from Registar compra; K1b notes limited to values the model produces and *purpose* added to §2; K7 recorded as a deviation from Slice 03 P5 (§3, §7, §12). 8 were refuted.

**Correction pass (pre-baseline).** The earlier design made stock confirmation a required step after the purchase, introduced a *Comprado · estado por confirmar* state that blocked re-listing, and merged Slice 03's success with that step. Corrected per product decision: a recorded purchase is complete on its own; Stock records the fact and the history; the human state is untouched until a person changes it; review is optional (*Rever stock*) and never blocks any Stock action; Slice 03 P5 is reached as approved. Boards K7/K7b and the prototype were rewritten; no other slice UX changed.

## 12. Canonical tensions found

- 04 J3/J6 end with "Stock Lite updates" after a recorded purchase. Here that update is the purchase history and the "comprado hoje" fact only; the human state never changes by itself. If the pilot expects the mark to clear on its own, J6 step 8 wording will need to say what "updates" means.
- Slice 03 P5 is unchanged, including "Stock actualizado: n produtos"; the only addition for Stock-originated purchases is a follow-up card. That pill could be read as a level change; this slice explains it in the card instead of rewording the Slice 03 baseline. A rewording (e.g. "n produtos registados no Stock") is a suggestion for Slice 03, not applied.
- 03 §4 Stock excludes "exact per-service consumption" while 02 #7 names excess consumption as a confirmed problem; the only honest signal available is the interval between purchase and *Baixo* mark (Q4).
