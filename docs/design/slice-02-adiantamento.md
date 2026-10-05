# Design slice 02 — Adiantamento / saída pessoal (shared smartphone)

**Status:** design proposal for review. Not a product decision; not an implementation spec.
**Canvas:** https://claude.ai/artifact/Sbv7xGNEnEFQdD1QM6bunF (private until shared)
**Baseline it extends:** [Slice 01](slice-01-hoje-registar-servico.md) (commit `2e532a7`).
**Canonical inputs:** [01 §2](../01_DISCOVERY_SUMMARY.md#2-remuneration) (advances) · [03 §2 #7, §5](../03_V1_SCOPE.md) · [04 J2](../04_CORE_USER_JOURNEYS.md#j2--personal-advance) · [05 §3–§4](../05_PRODUCT_EXPERIENCE_MODEL.md#3-operator-and-authorization-model--decided-concepts-only) · [06](../06_DESIGN_PRINCIPLES.md)

Status tags as in [00](../00_PRODUCT_CONTEXT.md#status-vocabulary-used-in-all-docs). Everything here is `Candidate / hypothesis` unless it cites a `Decided` item.

---

## 1. Scope

Designed: the `Hoje → Adiantamento` flow on the shared salon phone, with its states (empty amount, authorization boundary, warning inside the boundary, success, save error, discard). `Hoje` is unchanged; its existing *Adiantamento* quick action is simply wired.

Not designed: the professional-context entry point (Equipa / J4), the authorization mechanism, correction behaviour after registration, any balance or payable view.

## 2. What an advance is (as designed)

Money handed to a team member during the period, **by account of what they will receive** at close. One operational record replaces the two notebook entries. It is not a salon expense, salary, owner distribution or loan — the step-1 footnote says exactly this in plain words ("Dinheiro entregue a uma pessoa da equipa por conta do que vai receber. Não é uma despesa do salão.").

## 3. Rationale

| Problem | Response |
|---|---|
| Shared phone: the person holding it is often the one handing over the cash, not the recipient | Step 1 is always **"Adiantamento para quem?"** — the same tile grid as Slice 01 J1, one tap. |
| Header contract | Same as Slice 01: back/× left, flow name centre, step label right, progress bars on every step. The confirmation screen counts as step **3 / 3**, as Slice 01 counted its confirm step. |
| Must be done in seconds between customers | **3 steps**: who → *Quanto e como?* (amount, method, optional note on one screen) → *Confirmação necessária* → success. ~5 taps plus typing the amount. |
| It is a sensitive financial action (05 §3) | The flow always lands on an explicit **authorization boundary** before anything is saved: a screen titled *Confirmação necessária* that restates the movement in full and says it must be confirmed by an authorized person. The mechanism (PIN, role, etc.) is deliberately **not** designed; the primary button stands where it will go. |
| Privacy (05 §4, `Decided`) | Only the four facts needed to record the movement are ever shown: person, amount, method, note. No earned value, percentage, payable or balance appears on any screen, including success. |
| Advance above earned is an open rule (04 J2: warn, don't block) | No earned balance is consulted on the shared surface. **Inside the boundary only**, a warning screen may state the *relation* ("Valor acima do que já ganhou neste período") and hand the decision to the confirmer ("A decisão é de quem confirma e fica registada com este aviso."). No amounts, balances or consequences are stated. The comparison can only exist for **determinate** remuneration (03 §3); for contextual/pending remuneration no comparison is made and no warning fires. See §7 Q1–Q2. |
| Malformed amounts | Digits only, live thousand grouping, 9-digit cap, starts empty with `0` placeholder, currency as an organization setting (tweak in the prototype). *Continuar* disabled until > 0, with a plain hint. |
| Preserve work on failure (Slice 01 pattern) | Save error shows the Slice 01 alert banner on the confirmation screen; all data stays; *Tentar novamente* is primary; *Sair sem guardar* goes through the discard sheet. |
| Accidental exit with typed data | **×** leaves immediately when nothing has been typed; whenever an amount or note exists — on any step, including after going back to step 1 — × and *Sair sem guardar* open a bottom sheet *Descartar este adiantamento?* with "Nada foi registado." |

## 4. Flow

| Step | Screen | Key elements |
|---|---|---|
| 1 | **Adiantamento para quem?** (A1) | Name tiles with capability hint; progress 1/3; × → Hoje (or discard sheet if data exists). |
| 2 | **Quanto e como?** (A2) | Person chip (tap to change); large amount field (*Valor entregue*, empty, `0` placeholder, Kz suffix, hint); segmented *Forma de entrega*: Numerário / Transferência; *Nota (opcional)* single line, 60 chars; footer summary + **Continuar**. Progress 2/3. |
| 3 | **Confirmação necessária** (A3) | Progress 3/3. Movement card: Para / Valor / Forma de entrega / Nota; info box with lock icon: "Fica no histórico com data, hora e quem confirmou. É descontado ao valor a receber no fecho do período."; **Confirmar adiantamento**. Back returns to A2 with data intact. |
| 3b | **Aviso** (E3, inside the boundary, candidate) | Warning banner stating the relation and the decision line only; full movement card including the note; **Confirmar mesmo assim** / **Rever valor** (back also returns to step 2). |
| 4 | **Sucesso** (A4) | "Adiantamento registado com sucesso." + recap (person · amount · method · time) + *Corrigir este registo* link; **Voltar a Hoje** (primary) / *Registar outro adiantamento*. |

States on the canvas: E1 valor em falta (bloqueado), E2 erro ao guardar, E3 aviso dentro da autorização, E4 descartar. The interactive prototype covers the whole path; *simulateSaveError* and *simulateAboveEarned* tweaks show E2/E3.

## 5. Privacy handling

- Shown: recipient, amount, delivery method, optional note, timestamp. These are the record itself.
- Never shown: earned value, remuneration %, amount payable, balance, pending-remuneration status, any other person's situation.
- The success recap repeats only what the operator typed.
- The advance is **not** added to Hoje's shared *Recentes* list. Unlike a service price (catalogue information), money handed to a named person is that person's financial situation (05 §4). Where advances are listed (Equipa in the authorized context; possibly Dinheiro) is open (§7 Q3).
- The E3 warning is shown **only after** the authorization boundary and states a relation, not a number. Whether even the relation is acceptable is open (§7 Q1).

## 6. How this extends Slice 01

Reused unchanged: header contract (back/× · flow name · step label; bars on every step), tile grid, chip, segmented control, large numeric card, footer summary + primary button, error banner, neutral success screen (recap: facts line, then "Hoje às HH:MM"), tokens (ground `#F7F4EE`, ink `#25272B`, placeholder accent `#3030A8`, semantic success/warning/error, identity avatars, disabled), Instrument Sans (provisional).

New patterns introduced (candidates for the baseline):

1. **Authorization boundary screen** — *Confirmação necessária*: title + one-sentence explanation + full movement card + info box with lock icon + primary confirm. Reusable for any sensitive action (approving payables, reopening a period).
2. **Key/value movement card** (`Para / Valor / Forma de entrega / Nota`).
3. **Discard bottom sheet** for leaving with typed data. Slice 01's capture flow had no such sheet; this one is justified because the amount is typed, not picked. Slice 01 could adopt it for the edited-price case (not changed here).
4. **Warning-inside-boundary screen** (E3): warning banner + movement card + *Confirmar mesmo assim* / *Rever*. Pattern for "human decision where the rule is contextual" (06 #7).
5. **Success footer rule** (proposed for the baseline): repeatable capture (services) → primary = *Registar outro*; sensitive one-off movement (advance) → primary = *Voltar a Hoje*, *Registar outro* secondary.

## 7. Open questions surfaced (`Open / requires validation`)

1. **E3 relation disclosure.** Stating "valor acima do que já ganhou" to the confirmer reveals that the person's earned total is below the advance. 04 J2 permits showing impact within the authorized context; the docs do not say whether the *confirmer* is always entitled to that. Resolve with the authorization model (03 §5). Wording ("ganhou" vs "apurado") to validate with the pilot.
2. **Pending remuneration.** For a professional whose remuneration is contextual/pending (03 §3) no earned value exists to compare against, so the E3 warning cannot fire; the design makes no claim for that case. Whether the confirmer should see a neutral notice ("remuneração deste período ainda por determinar") is open. An earlier draft of E3 stated what happens to an excess advance ("fica a dever ao salão até ao fecho"); that sentence was **removed** because no such rule exists (03 §5 advance policy).
3. **Advances in Hoje *Recentes*.** An advance line reveals to anyone holding the phone that a colleague received money. Options: show as "Adiantamento · Nádia" without amount; show only to the confirmer; or accept. Extends Slice 01 §8b.
4. **Self-recording an advance.** Nothing stops the recipient from preparing their own advance; the boundary catches it at confirmation. Is that the intended model, or should the recipient not even start the flow?
5. **Who may confirm.** The boundary exists; the set of authorized people is open (03 §5).
6. **Correction after registration.** *Corrigir este registo* is placed; behaviour is open (as in Slice 01).
7. **Method set.** Numerário / Transferência only; *Misto* was not offered for advances (brief). Confirm with the pilot that split advances do not occur.
8. **Note privacy.** Free text might contain personal reasons; who can read it later is part of Q5.

## 8. Assumptions

Sample data only (names, Kz). Currency is an organization setting. Advance amounts are whole units (no decimals) in the pilot context; the field is digits-only. The Hoje activity count line counts services only; advances do not increment it.

## 9. Intentionally left out

PIN/biometric/role UI; any balance, earned or payable figure; limits or credit rules; reason categories; multi-person or recurring advances; owner distributions; the Equipa entry point; correction flow.

## 10. Canonical tensions found

- 04 J2 step 5 ("show impact on earned and remaining balance" within the authorized context) has **no visible counterpart** in this slice, by the brief's instruction. The impact is deferred to the private context (Equipa / J4). Same structural tension as Slice 01 §10.
- An early E3 draft stated a carry-over rule for excess advances; it was removed after review. E3 now states only the relation and that the decision is the confirmer's.
- "quem confirmou" in the A3 info box presumes that the identity of the confirmer is recorded (03 §2 #14 audit trail); how it is established depends on the open authorization model (03 §5).

## 11. Review performed

A 5-lens multi-agent review (canonical, privacy, speed, craft, prototype logic) produced 47 findings, each tested by 3 adversarial verifiers; 12 survived and were fixed: E3 debt-rule copy removed and the note row added; advances no longer listed in the shared Hoje *Recentes*; discard guard applied on every step; "fecho do mês" → "fecho do período"; header contract aligned with Slice 01 (3 steps, bars everywhere); success recap aligned; E3 back arrow returns to step 2. Three refuted items were also applied because they were cheap and clearly right ("Entregue por" → "Forma de entrega"; demo-error flag reset; state reset on *Voltar a Hoje*).
