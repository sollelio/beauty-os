# Design slice 01 — Hoje + Registar Serviço (shared smartphone)

**Status:** design proposal for review. Not a product decision; not an implementation spec.
**Canvas:** https://claude.ai/artifact/AnRsMRwA6SUh3DbZeRSuFt (private until shared)
**Canonical inputs:** [03 V1 Scope](../03_V1_SCOPE.md) · [04 J1](../04_CORE_USER_JOURNEYS.md#j1--record-completed-service) · [05 Experience Model](../05_PRODUCT_EXPERIENCE_MODEL.md) · [06 Principles](../06_DESIGN_PRINCIPLES.md)

Status tags as in [00](../00_PRODUCT_CONTEXT.md#status-vocabulary-used-in-all-docs). Everything in this file is `Candidate / hypothesis` unless it cites a `Decided` item.

---

## 1. Scope of this slice

Designed: the mobile `Hoje` screen and the complete `Registar Serviço` flow (normal, editable price, mixed-payment validation, success, save error), for **one salon-owned smartphone used by several people during operations**.

Not designed: Equipa, Dinheiro, Stock, Fecho, Settings, desktop, supplier or customer experiences. They appear only as navigation hints (tab bar, attention rows).

## 2. Design rationale

| Problem the design answers | Response |
|---|---|
| The phone is shared; whoever holds it may not be the professional who did the work | Step 1 of the flow is always **"Quem fez o serviço?"** — a 2×2 grid of large name tiles, ordered by recent activity. One tap selects and advances. No login/logout. |
| Capture must happen between customers | **3 steps, ~4 taps for the common case** (Registar serviço → name → service → Confirmar). Price and payment share one screen so the common case (default price, single payment method) needs no extra taps. |
| Shared-device privacy (`Decided`, 05 §4) | The flow shows only operational facts: who, which service, catalogue price, payment method. **No split, earnings, balance or remuneration status anywhere**, including the success screen, which is a neutral "Serviço registado com sucesso." |
| Remuneration may be contextual/pending (`Decided`, 03 §3) | The capture flow computes nothing visible. Determinacy is handled underneath; the pending status is *not* surfaced to an ordinary operator (05 §7 applies within the authorization boundary, which this flow is outside). |
| Pricing variability not ruled out | Default price shown large with **Editar**. Edit mode opens an empty field with the usual price as placeholder (first digit typed replaces it), keeps the usual price visible with **Repor**, and is committed by **Confirmar serviço** itself — no separate "OK" step. A changed value gets a quiet marker ("Valor diferente do habitual. Fica registado no histórico."). A zero value **warns but does not block** (06 #7). No discounts or price rules. |
| Mixed payments must add up | Two labelled amount fields; a live sentence states the sum and the gap ("Soma 11.000 Kz. Faltam 1.000 Kz…"); Confirmar stays disabled until equal. |
| Hoje is an operational home, not a dashboard | One primary action, two small secondary actions, a single salon-level count line, an **Atenção** list of exceptions only, and the four most recent records. No charts, no money totals. |

### Visual direction

Contemporary, practical, quiet. One typeface (Instrument Sans, provisional), tabular numerals for money. Colour tokens after the neutralization pass (§12):

| Role | Token | Status |
|---|---|---|
| Ground / ink | Warm Off-white `#F7F4EE` / Warm Graphite `#25272B` | Sollelio system neutrals |
| Interactive placeholder (primary action, selection, progress, links, active tab; hover `#11152D`) | Mineral Indigo `#3030A8` (chip tint `#E8E9F7`) | **Provisional placeholder — not the Beauty OS accent** |
| Semantic success | `#1E6B43` icon / `#1A5C3A` text on `#E3F0E7` | semantic, product-system |
| Semantic warning / attention | `#8A5A00` icon / `#5B4000` text on `#FBF1DC`; `#B7791F` marker dot | semantic, product-system |
| Semantic error | `#9A2A22` icon / `#7A1F18` / `#5B2A26` on `#FBE7E5` | semantic, product-system |
| Identity (avatars only) | `#4A5568` · `#6B4F8A` · `#3F6E8A` · `#8A4F5E` | non-semantic identity palette |
| Muted text, lines, disabled | `#5B5F68`; `#E6E6E1` / `#D9D9D3` / `#DEDED8`; `#E3E5E2` | neutrals |

Cards are used sparingly (value block, activity count); lists are separated by hairlines. No imagery, gradients or beauty clichés.

### Form factor

These artboards are the **smartphone / mobile-web** view of one responsive web application ([05 §2](../05_PRODUCT_EXPERIENCE_MODEL.md#2-device-constraints-and-form-factor)). Full-screen steps and bottom navigation are native-like patterns used for speed; they do not imply a native app. Tablet/desktop adaptations are not part of this slice.

### Accent and typography status — provisional

Facts established from this session's record:

1. The green `#1E5A4C` was **chosen independently during Slice 01** as a neutral, trustworthy accent that avoided generic SaaS blue and salon-pink clichés. It is not grounded in any Sollelio product-brand decision.
2. It was **not derived from the pilot's identity**: the Salão Agradável logo (lime green, botanical) was not shared until after Slice 01, and the Sollelio brand assets in `sollelio-brand-assets/` (on disk, but not referenced by any canonical doc at the time) were not consulted. The shared green family is coincidental — but it creates a **perception risk** that the product accent came from the tenant, and it sits close to the Events accent (Teal `#00A69A`).
3. It was therefore a **provisional token**, not a candidate Beauty OS accent ([05 §6](../05_PRODUCT_EXPERIENCE_MODEL.md#6-product-identity-vs-tenant-identity--decided)), and was **removed before baseline** (§12). The same status applies to Instrument Sans: the product UI typeface is a Sollelio product-system decision not yet taken (brand lockups use Rubik; UI typography is a separate decision and was deliberately not switched to Rubik).

## 3. Hoje — content and order

1. Date and title; Settings as an icon-only control (secondary).
2. **Registar serviço** (primary, 60 px).
3. Two small quick actions for context: Adiantamento · Despesa ou compra (not designed further).
4. Today's count: `14 serviços registados hoje · 9 numerário · 4 transferência · 1 misto · último às 16:42`.
5. **Atenção**: exception rows that deep-link to other spaces (e.g. stock items marked out; a period ready for payment).
6. **Recentes**: time · service · professional · payment method · catalogue price; "Ver tudo" → Serviços.
7. Tab bar (see §6).

Deliberately absent: revenue totals, per-professional production, remuneration, pending-status indicators.

## 4. Registar Serviço — flow

| Step | Screen | Key interactions |
|---|---|---|
| 1 | **Quem fez o serviço?** | Name tiles with capability hint ("Cabelo · Unhas"); tap advances. Close (×) returns to Hoje. |
| 2 | **Que serviço?** | Context chip with the selected person (tap to change). Compact search. **Frequentes de \<nome\>** first (name + price), then "Ver o catálogo completo". Tap advances. |
| 3 | **Valor e pagamento** | Large default price + **Editar**. Segmented Numerário / Transferência / Misto. Misto reveals two fields + live sum sentence. Footer summary line + **Confirmar serviço**. |
| 4 | **Sucesso** | Neutral confirmation + operational recap (service · person · time · method). **Registar outro serviço** (primary) / **Voltar a Hoje**. Small "Corrigir este registo" link (correction preserves history, per 04 J1). |

States on the canvas: preço editado (E1), misto incompleto — bloqueado (E2), misto válido (E3), erro ao guardar (E4). An interactive prototype covers the whole path including the error (toggle *simulateSaveError* in Tweaks).

## 5. How shared-device privacy shaped the design

- Removed the "immediate split" from step 6 of J1 for this surface; replaced by a neutral success and an operational recap only.
- Hoje shows salon-level counts and individual *service* prices (catalogue data), never per-person totals. Whether a day's recent list lets someone infer a colleague's production is noted as open (§8).
- The pending-remuneration status is **not shown** anywhere in the ordinary flow.
- No PIN, lock, role switch or authentication UI is designed. The "authorized/private context" of 05 §4 is outside this slice.

## 6. Navigation assumptions (`Candidate / hypothesis`)

- A bottom tab bar with **five** slots: Hoje · Serviços · Equipa · Dinheiro · **Mais** (Stock, Fecho, Definições). Six first-level tabs do not fit a 390 px phone without small text. Alternative: Stock as a tab and Fecho inside Dinheiro. To validate with the pilot.
- `Registar serviço` opens as a full-screen flow over Hoje; × on step 1 and "Voltar a Hoje" on success return to Hoje.
- Attention rows deep-link into the relevant space.
- Space names are the pilot's Portuguese labels; localization remains open (05 §1).

## 7. Assumptions made

- Sample data (names Fernando, Nádia, Laurindo, Carla; services; prices in Kz) is illustrative only. Nádia and Carla are placeholders, not pilot people. Currency is an organization setting (exposed as a tweak in the prototype).
- Payment methods shown are the three the pilot uses; whether the set is configurable stays open (03 §5).
- "Frequentes de \<nome\>" is derived from that person's history; before history exists, the full catalogue is shown.
- Default prices are editable per record without any rule system.
- A failed save keeps all entered data and offers retry.

## 8. Open questions surfaced by the design (`Open / requires validation`)

1. **Recent-activity prices on Hoje.** Individual service prices are catalogue data, but a visible day list could let a colleague roughly infer another's production. Is the per-record price acceptable on the shared surface, or should Hoje show method only?
2. **Salon-level counts on Hoje.** Count of services by payment method is shown; revenue totals are not. Confirm that counts are acceptable operational information.
3. **"Corrigir este registo" from the success screen.** Who may correct, and for how long, is open in 04 J1. The link is placed; its behaviour is not designed.
4. **Tab structure** (§6).
5. **Mixed payment with more than two components** (e.g. two transfers) — not supported in this design; validate whether it occurs. Also open: whether the second component should be pre-filled from the first (design currently asks for both).
6. **Recording for a person not in the list** (new/temporary professional) — not designed; belongs to Equipa.
7. **Zero-price services** (complimentary redo, touch-up). The design allows them with a warning. Whether they should be allowed, blocked or recorded as a distinct kind of event is a product decision not yet made.
8. **"Sair sem guardar" on the save-error screen** discards a performed service in one tap. Whether it needs a confirmation step is open.
9. **"Registar outro serviço" resets the person.** Chosen for shared-device safety (the next service may be someone else's). A manager batch-recording for one colleague pays one extra tap; validate with the pilot.

## 8a. Review performed

A multi-agent review (5 lenses: canonical compliance, shared-device privacy, operational speed, visual/accessibility craft, prototype logic) produced 50 findings; each was tested by 3 adversarial verifiers. 8 survived and were fixed (price-edit model unified between static artboard and prototype and made commit-by-Confirmar; clear-field bug; zero-price block → warning; Hoje content overflow; "Ver tudo" touch target; disabled-button contrast). 42 were refuted as taste, out of scope, or deliberately open — the ones with product substance are listed in §8.

## 8b. Service prices in recent activity on the shared device

**Distinction.** A service's price is *common/catalogue information*: it is printed on the price list, told to the customer, and visible to whoever handles payment. *Production and earnings* (a person's total for a day or month, their split, their payable) are sensitive individual financial information under 05 §4. A single record (16:42 · Corte · Fernando · 3.500 Kz) is the former. A list of records with names and prices is a path to the latter by addition.

**Inference risk, assessed.** On Hoje the list shows the four most recent records, so a device holder can see at most a fragment of anyone's day. The real inference surface is the **full day/period list in Serviços** ("Ver tudo"), especially if it can be filtered or grouped by person. What 01 records is that professionals keep their own notebooks and the owners review all of them at month end; it says nothing about whether colleagues see each other's daily production. The sensitivity of *daily* production among colleagues is therefore **not established either way** (Inferred: unknown, not "not sensitive").

**Recommendation** (`Candidate / hypothesis`):

1. Keep the per-record price on Hoje's short recent list. It is operational: it is the fastest way to notice a wrongly recorded value right after capture, and hiding it would weaken "capture once" error-catching.
2. Do not offer per-person totals, filters or grouping on any shared surface; those belong to the authorized/private context (Equipa, J4).
3. Treat the full list in Serviços as the surface where the decision bites: either show method without price on the shared device, or require the authorized context to see prices across a whole day. This is a Serviços-space design question, not a Hoje one.

**Evidence missing to close it** (`Open / requires validation`, ask the pilot):

- Do professionals today know roughly what colleagues produce per day? Is that considered private?
- Would any professional object to colleagues seeing the price of individual services they performed?
- How often is a wrong value caught by glancing at recent records (value of keeping the price visible)?
- Does the team want the full-day list visible on the shared phone at all?

Owner of the open question: [05 §4](../05_PRODUCT_EXPERIENCE_MODEL.md#4-shared-device-privacy--decided).

## 9. Intentionally left out

Customer field (optional or otherwise), notes, discounts/promotions, service duration, product consumption per service, multi-service tickets, receipts, any remuneration preview, any lock/PIN, Settings content, all other spaces.

## 10. Canonical decisions challenged?

None overturned. One tension made concrete: J1 step 6 ("show the consequence within the viewer's authorization boundary") has, on the shared surface, **no visible consequence at all** beyond the neutral confirmation. This is consistent with 05 §4 but means the "show consequences immediately" principle (06 #2) is only realised for the authorized/private context, which is not yet designed.

## 11. Baseline readiness (clarification pass, 2026-10-05)

**Structure, flow, copy, spacing, component shapes and interaction patterns are ready to serve as the design baseline.** Colour and typeface are provisional tokens.

Visual changes identified before baseline, and their outcome:

| Change | Why | Principle / decision | Outcome |
|---|---|---|---|
| Replace the green accent `#1E5A4C` (tint `#E3EFEA`, shade `#174539`) with a provisional neutral placeholder. | Green read as derived from the tenant's lime identity and sat near the Events teal. | 05 §6; 00 Brand architecture. | **Done** (§12): Mineral Indigo placeholder. |
| Separate the warning amber family from avatar colours; keep semantics distinct from any product accent. | `#8A5A00` was both the warning stroke and an avatar. | 05 §6. | **Done** (§12): identity palette for avatars. Amber vs Workforce amber `#D98A20` to be re-checked when the accent is chosen. |
| Decide the product UI typeface as a Sollelio product-system decision. | Typography is owned by Sollelio, not by a slice. | 05 §6. | **Open**; Instrument Sans retained as provisional. |

## 12. Visual-token neutralization pass (2026-10-05)

Purpose: remove accidental branding before the first baseline commit. **Only hex colour values changed** — verified by diffing every artboard (before vs after) with all hex values masked: zero non-colour differences in all 10 files. No change to information architecture, layout, spacing, copy, navigation, interaction flow, component structure or prototype logic. No tenant logo added; no colour derived from the tenant.

| Before | After | Role |
|---|---|---|
| `#1E5A4C` | `#3030A8` Mineral Indigo | interactive placeholder: primary button, segmented selection, progress bars, links, active tab, edit-mode border, step-2 chip text |
| `#1E5A4C` ("Fecho" attention dot) | `#5B5F68` neutral | informational attention marker — moved off the swappable accent so a later accent change cannot recolour a status indicator |
| `#174539` (hover) | `#11152D` Midnight Indigo | link hover |
| `#E3EFEA` (chip) | `#E8E9F7` | step-2 professional chip tint |
| `#E3EFEA` + `#1E5A4C` + `#174539` (success icon, mixed-valid banner) | `#E3F0E7` + `#1E6B43` + `#1A5C3A` | **semantic success**, now independent of the accent |
| `#17181C` | `#25272B` Warm Graphite | ink |
| `#F7F7F5` | `#F7F4EE` Warm Off-white | ground, "Editar" button fill |
| avatars `#1E5A4C` / `#5A4A8A` / `#8A5A00` / `#3A5F8A` | `#4A5568` / `#6B4F8A` / `#8A4F5E` / `#3F6E8A` | **identity palette**, non-semantic; the accent and the warning amber no longer appear on avatars |
| unchanged | `#5B5F68`; lines `#E6E6E1` `#D9D9D3` `#DEDED8`; disabled `#E3E5E2`; warning `#B7791F` `#FBF1DC` `#8A5A00` `#5B4000`; error `#FBE7E5` `#9A2A22` `#7A1F18` `#5B2A26` | neutrals and semantics |

Contrast after the pass (WCAG, computed): ink 13.6:1 on ground; muted text 5.8:1 on ground, 6.4:1 on white; white on indigo 9.9:1; indigo links/tabs 9.1:1 on ground; indigo on chip tint 8.3:1; success text 6.8:1 and icon 5.5:1 on tint; warning text 8.6:1 / icon 5.3:1; error text 8.7:1 and 9.8:1; disabled label 5.1:1; white on every avatar colour ≥ 5.5:1. Nothing is below 4.5:1. Four pairs are lower than before while staying well above threshold (ink/ground 16.5 → 13.6; muted/ground 6.0 → 5.8; two avatars 7.6 → 6.8 and 6.6 → 5.5); the primary-button and link pairs improved (8.0 → 9.9; 7.5 → 9.1).

Status: the colour treatment is **neutral/provisional**. The Beauty OS product accent remains **open** ([00](../00_PRODUCT_CONTEXT.md#brand-architecture--decided-supplied-by-sollelio)); Mineral Indigo is the master colour used as a placeholder, not a product-accent decision, and nothing here should be read as Sollelio Events styling.

Remaining purely visual open decisions: Beauty OS product accent; product UI typeface; whether semantic success/warning hues need re-tuning once the accent exists.
