# Design slice 04 — Situação do profissional (private / authorized context)

**Status:** design proposal for review. Not a product decision; not an implementation spec.
**Canvas:** https://claude.ai/artifact/MMyrW2Gm3LBJm58ibxebrQ (private until shared)
**Baselines it extends:** [Slice 01](slice-01-hoje-registar-servico.md) · [Slice 02](slice-02-adiantamento.md) · [Slice 03](slice-03-despesa-compra.md) (HEAD `4551ef9`).
**Canonical inputs:** [01 §2–§3](../01_DISCOVERY_SUMMARY.md#2-remuneration) · [03 §2 #5, #11, §3, §5](../03_V1_SCOPE.md) · [04 J4, J5](../04_CORE_USER_JOURNEYS.md#j4--professional-situation) · [05 §3–§4, §7](../05_PRODUCT_EXPERIENCE_MODEL.md) · [06 #4, #7](../06_DESIGN_PRINCIPLES.md)

Status tags as in [00](../00_PRODUCT_CONTEXT.md#status-vocabulary-used-in-all-docs). Everything here is `Candidate / hypothesis` unless it cites a `Decided` item.

---

## 1. Scope

Designed: the professional detail view inside an authorized/private context — period summary, explainable breakdown, determinate and pending remuneration states, advances, recorded payments (in whatever close state they exist), purchase contributions, period history, period switching, and the differences between the professional's own view and the manager/finance view.

Not designed: the Equipa list, payroll, monthly close itself, the authorization mechanism, correction flows (only their entry affordance), owner distributions.

## 2. Context

This is the first surface *inside* the authorization boundary that Slices 01–03 stop at. It is signalled, not mechanised: a **Privado** badge in the header, no PIN or role UI. Sensitive figures are allowed here (05 §4).

## 3. Rationale

| Principle / problem | Response |
|---|---|
| **Explain the numbers** (06 #4, `Decided`) | The headline **Falta receber** never stands alone: its derivation sits under it in one line (= ganho − adiantamentos − pagamentos); tapping it, or the "Como se chega a este valor?" line, opens a numbered plain-language calculation; every breakdown row opens the records behind it. |
| No black-box total | Breakdown rows in a fixed order: Produção → Regra deste período → Ganho → Adiantamentos → Pagamentos. Each shows its own derivation in a sub-line ("70% × 100.000"). The headline is the total; it is not repeated as a row. |
| Totals derive from records | Every figure on screen is the sum of the period's event rows; the history filter for a row shows exactly the records that produce it (15 serviços = 100.000, not a rounded aggregate with hidden rows). |
| Determinate vs contextual remuneration (03 §3, 05 §7, `Decided`) | Two states of the same screen. **Determinate**: rule as a percentage, who set it and when (manager view), earned and remaining computed. **Pending**: headline "—" with "Por determinar", an amber notice says earned and remaining do not exist until the rule is set, production and advances stay visible, advances are shown unsigned with "descontado quando a regra for definida". No provisional figure, and **no claim about when** the rule is decided (03 §5 open). |
| Advances ≠ payments ≠ remuneration ≠ contributions | Separate rows, separate history filters, separate explanation steps ("Adiantamentos recebidos", "Pagamentos feitos"). An advance is "dinheiro recebido antes, por conta"; a payment is money paid against the amount payable, recorded whenever it happens. Purchase contributions sit in an **À parte** block outside the calculation: "Não é descontado nem somado ao valor a receber". No owner distribution appears. |
| Payments follow the close progression (04 J5: Open → Ready for payment → Payment in progress → Closed) | The view **displays a payment as soon as a payment event is recorded**, whatever the period's state; it never requires *Closed*. The headline stays *Falta receber = ganho − adiantamentos − pagamentos* for every period, with the period's state beside the label ("aberto", "em pagamento", "fechado"). Sample: Setembro is **em pagamento** — payment recorded on 2 out, period not yet closed — and reads Falta receber 0 Kz. When the first payment may be recorded, and whether partial payments exist, are Close-state questions (§8); this slice only shows the recorded truth. |
| Negative balance is not a debt | If advances exceed earned, the headline shows 0 with the real arithmetic beneath ("… = −15.000"), a neutral notice states the difference and that the decision is the manager's, and the explanation sheet says why it shows 0 (06 #7). No timing is asserted. |
| Scannable on a phone | One typeface, hairline rows, tabular numbers right-aligned, one card only (À parte). No charts, tiles or tags. |
| History without a ledger | **Histórico**: one chronological list grouped by day with filter chips (Tudo · Serviços · Adiantamentos · Pagamentos · Contribuições). The row title names the event ("Adiantamento", "Pagamento", "Contribuição em compra"); services show the service name with "Serviço · método" beneath. Amounts carry "−" for advances and payments; contributions are grey and unsigned. |
| Period, not month (03 §5 open) | A **period chip** opens a sheet listing periods with their state (aberto · em pagamento · fechado) and recorded payment totals; selecting any period re-derives the whole screen from that period's records. Closed periods are presented read-only here; the docs already say they change only by authorized reopening in Fecho (04 J5). "Outubro" is sample data. |
| Audit, not deletion | Manager rows carry a 44 px "⋯ Opções" affordance (correction entry point, not designed) and "confirmado por X". No delete anywhere. |

### Manager/finance vs the professional's own view

| | Manager / finance | Professional (self) |
|---|---|---|
| Entry | Equipa → person | Own context (from Hoje or a personal device, later) |
| Title | "Situação do profissional" | "A minha situação" |
| Rule row | "70% para Nádia · 30% para o salão · definida em 1 out"; footer names who set it | "70% para si · 30% para o salão"; no attribution |
| History rows | "· confirmado por …" + ⋯ options | records only |
| Reach | other professionals via Equipa | only own records; footer "Se algum valor não bater certo, fale com a gestão." |

Same numbers, same structure; the differences are visibility and affordances.

## 4. Screens

| Board | Content |
|---|---|
| **S1 Resumo** (manager, open period) | Header (back · title · Privado), person + period chip, Resumo/Histórico; headline + derivation + explain line; five breakdown rows; À parte; audit footer. |
| **S2 Explicação** | "Como se chega a 45.000 Kz?" — produção, regra (com quem a definiu), ganho, adiantamentos recebidos, pagamentos feitos, falta receber. |
| **S3 Histórico** | Filter chips; "18 registos · mostra os 7 mais recentes"; day-grouped rows with ⋯. |
| **S4 Adiantamentos** | Filtered history with method, who confirmed, note; footnote defining an advance. |
| **S5 Período em pagamento** | Setembro, not yet closed: "Falta receber · em pagamento — 0 Kz = ganho 66.500 − adiantamentos 5.500 − pagamentos 61.000"; Pagamentos row "1 pagamento registado · 2 out · transferência · confirmado por Mercy". Same structure as S1; no extra box. |
| **P1 Pendente** | Rule "Ainda não definida / Por determinar"; "—" for ganho and falta receber; amber notice; advances unsigned. |
| **V1 / V1b / V1c** | Self view: resumo, histórico (no attributions, no ⋯), explicação (no "definida por"). |
| **V2 Contribuições** | Filtered history + box "Entra em «Falta receber»? Não" + factual footnote. |
| **V3 Período** | Open period marked with a check; "em pagamento" and "fechado" periods with their recorded payment totals; "Períodos fechados só se alteram por reabertura autorizada no Fecho." |

The interactive prototype (Main) switches **viewer** (gestor / profissional) and **remuneration** (determinada / pendente) from Tweaks and re-derives everything — breakdown, explanation, history, period sheet — from the selected period's records.

## 5. Sample data (illustrative)

Nádia, Outubro (aberto): 15 serviços = 100.000; 70% → ganho 70.000; adiantamentos 10.000 + 15.000; pagamentos nenhum registado; **falta receber 45.000**; contribuição 8.500 à parte. Setembro (em pagamento, not closed): 12 serviços = 95.000; 70% → 66.500; adiantamento 5.500; pagamento registado 61.000 em 2 out → falta receber 0. Agosto (fechado): 80.000 → 56.000; 1.800; pago 54.200. Carla, Outubro (aberto, pending): 9 serviços = 64.000; adiantamento 10.000; Setembro (em pagamento): regra 50% definida em 30 set, 72.000 → 36.000, pagamento registado 36.000.

The rule is a per-organization/per-person, per-period setting (03 §3); percentages are sample data.

## 6. Privacy handling

Sensitive figures appear only here, behind the boundary; nothing changes what the shared-device flows reveal. In the self view no other person's data is reachable and no attributions are shown; in the manager view the audit lines name colleagues who confirmed movements (authorization-model question, §8).

## 7. How this extends Slices 01–03

Reused unchanged: chip (44 px), segmented switch (52 px), bottom sheets, key/value box, tokens, provisional typeface, identity avatars, warning/success semantics.

New patterns proposed for the baseline:
1. **Detail header** — back · centred title · context badge; person row with period chip; section switch. Distinct from the capture-flow header (step label + bars).
2. **Headline with inline derivation** that opens an explanation sheet of numbered steps.
3. **Breakdown rows** that each open their evidence (the history filtered to that type).
4. **Pending-value state**: "—" + "Por determinar" + amber notice; never a provisional number, never a timing claim.
5. **À parte block** for a concept recorded but excluded from a calculation.
6. **Filterable day-grouped history** with event names as titles (no colour- or tag-coding).
7. **Privado badge** (13 px uppercase) as the visible marker of the authorized context.
8. **Period state beside the headline label** ("Falta receber · aberto / em pagamento / fechado") on every summary, including the pending one; the same summary serves every state, closed ones read-only.

## 8. Open questions (`Open / requires validation`)

1. **Payments and the Close state machine** (not resolved here; the view only displays recorded payment events): at which Close state may the first payment be recorded? Are partial payments allowed, and how would several payments in one period display? How are payment corrections handled (who, when, with what trace)?
2. **When the contextual rule is decided.** Deliberately unstated (03 §5 "contextual rate timing"); the UI says only "Ainda não definida".
3. **Contribution treatment at close.** Shown "à parte" with no consequence (03 §5).
4. **Who sees audit attributions** ("confirmado por", "definida por") — hidden in the self view here; to confirm with the authorization model.
5. **Correction affordance** (⋯) — entry point only; behaviour and permissions open.
6. **Advances above earned** — a neutral notice, no rule (06 #7); wording to validate.
7. **Period model** — months as sample; whether periods are always calendar months is open (03 §5).
8. **Self-view entry point** — Hoje, Equipa, or a personal device later (05 §2).
9. **Rule changes within a period** — not represented; one rule per period assumed.
10. **Retained / reinvested amounts and owner distributions** — owner-level views, not shown here.

## 9. Assumptions

Sample names and amounts; currency as organization setting; one rule per period per person; every total derived from the period's records; a payment event is displayed wherever it exists, with no assumption about when it became possible; closed periods read-only in this view.

## 10. Intentionally left out

Equipa list; payroll/payslips; close actions; PIN/roles; editing or deleting records; charts; owner distributions; cross-period aggregates; notifications.

## 11. Review performed

A 5-lens multi-agent review (canonical, explainability/arithmetic, comprehension, craft, prototype logic) produced 60 findings, each tested by 3 adversarial verifiers; 31 survived and were addressed in one correction pass: dataset made self-consistent (every total derives from visible records; closed periods carry their own records); the mid-period "pagamento parcial" removed from the open period and payments shown in a closed period instead; rule-timing copy neutralised; "Já recebido por conta" split into advances and payments; self view no longer leaks attributions or "para Nádia"; "−0 Kz" and signed advances in the pending state fixed; negative balance clamped with a neutral notice; period switching re-derives the screen; row ⋯ restored to 44 px; component dimensions restored to baseline; tags removed; S1 height trimmed (headline is the total, no duplicate row); V2/V3 footnotes made factual; self-view history and explanation boards added so V1 no longer links into manager boards; header recorded as a new pattern. 29 were refuted as taste, out of scope, or deliberately open. A second re-check found 4 prototype-only issues (signed zero on empty history filters, a false equation in the overdrawn edge case, missing empty-state text, selected period marked by border only), all fixed; the overdrawn notice was also made timing-neutral.

**Correction pass (pre-baseline).** The earlier claim that payments appear only in closed periods conflicted with 04 J5 (Open → Ready for payment → Payment in progress → Closed). Corrected: the view displays a recorded payment in any period state; the sample Setembro period is now "em pagamento" with its payment recorded before close; the headline/derivation model is unchanged and unified across states; the open question was narrowed to Close-state questions (§8 Q1). No Close flow was designed.

## 12. Canonical tensions found

- 04 J4 lists "contributions where relevant" and 03 §2 #9 keeps them a separate concept — shown separately with no arithmetic effect; the pilot may expect netting at close (Q3).
- 04 J2's "show impact on earned and remaining balance within the authorized context" is realised here, closing the structural gap noted in Slices 01–02.
- The pending state shows advances as a plain amount with no total they subtract from — the honest representation of 03 §3, possibly perceived as incomplete; wording to validate.
