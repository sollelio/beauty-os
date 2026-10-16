# 05 — Product Experience Model

**Canonical for:** primary product spaces, device constraints and form factor (responsive web), the operator/authorization model at product level, shared-device privacy, product identity vs tenant identity, and how remuneration determinacy is presented.

Journeys: [04](04_CORE_USER_JOURNEYS.md) · Principles: [06](06_DESIGN_PRINCIPLES.md) · Status tags: [00](00_PRODUCT_CONTEXT.md#status-vocabulary-used-in-all-docs)

This is a product model, not a UI design, navigation implementation or auth architecture.

---

## 1. Primary product spaces — `Decided`

```text
Hoje · Serviços · Equipa · Dinheiro · Stock · Fecho
```

Settings is secondary.

| Space | Purpose | Prioritizes | Avoid |
|---|---|---|---|
| **Hoje** | Operational command centre: *"What happened, and what requires my attention now?"* | Quick actions; today's activity; meaningful exceptions; concise operational figures | A dashboard full of charts |
| **Serviços** | Completed-service activity | Recorded services first; catalogue/configuration secondary | Leading with catalogue management |
| **Equipa** | Operational/financial situation of people | Production, earnings, advances, payable (J4) | Plain employee records |
| **Dinheiro** | Operational financial timeline and money movements | Expenses, purchases, reserves, movements in time order | Accounting-heavy terminology and structures |
| **Stock** | Products requiring attention | Attention list; approximate levels/reserve state; purchase preparation; history | Warehouse-style inventory |
| **Fecho** | Exception-driven monthly review | Exceptions; approval; payment; closure (J5) | Exhaustive line-by-line inspection |
| **Negócio** (private) | Business health: *"How is the business doing, and what changed?"* ([07 D9](07_PRE_IMPLEMENTATION_GAP_CLOSURE.md#d9--business-health-v1-negócio--visão-geral-metrics-comparison-core-insights-access)) | Period figures, comparison with closed periods, a few explainable insights; Equipa: the team's contribution (per professional only with team finance access); Serviços: what customers buy and how demand moves; Custos & Stock: where money goes and which products keep coming back; Finanças: the period's money from production to result, reserve and obligations (not an accounting statement); Insights: every insight, prioritised, open situations now and the selected period's analysis | A chart dashboard; a ranking; individual remuneration |

### Journey → space

| Journey | Primary space | Entry from Hoje |
|---|---|---|
| J1 Record service | Serviços | Quick action |
| J2 Personal advance | Equipa | Quick action |
| J3 Expense / purchase | Dinheiro | Quick action |
| J4 Professional situation | Equipa | — |
| J5 Monthly close | Fecho | Exception / reminder |
| J6 Stock / prepare purchase | Stock | Attention items |

Entry points from Hoje are `Candidate / hypothesis`.

`Open / requires validation` Space names are in the pilot's language (Portuguese). Localization for other organizations is not decided.

## 2. Device constraints and form factor

- `Confirmed` The pilot has **one salon-owned smartphone and no laptop.**
- `Decided` Core operation must be **excellent on one shared smartphone**. This is a real constraint, not an edge case.
- `Decided` Compatible with a future mode where professionals use **personal devices**.
- `Decided` Desktop will be valuable later for management/financial review, but V1 core operation must **not** depend on a laptop.

### Responsive web application — `Decided`

> Beauty OS is one responsive web application, mobile-first, usable on smartphone, tablet and desktop/laptop.

- Phone artboards in design slices (e.g. [Slice 01](design/slice-01-hoje-registar-servico.md)) represent the **smartphone / mobile-web** experience of that one application, not a native app.
- Native-like mobile interaction patterns are acceptable and desirable **where they improve speed and usability** (stated by Sollelio with the decision). Which specific patterns are adopted (e.g. the bottom navigation and full-screen steps proposed in Slice 01) remains `Candidate / hypothesis` until validated.
- `Decided` (Sollelio, 2026-10-13, mobile UX foundation slice) **Back/history contract**: Hoje is the root hub; capture flows (Registar serviço, Adiantamento, Despesa, Compra) are full-screen tasks whose steps are history entries, so Android/browser back returns to the previous step with entered data intact; leaving with unsaved data asks first ("Continuar a editar" / "Descartar"); an open sheet closes on back before the screen is left; after a successful save, back does not reopen the submitted form; app-bar back goes back in history, or to the parent screen when opened by a deep link. Implemented in `src/shared/ui/navigation.ts`; other screens adopt it in later slices. Bottom navigation is not adopted (still `Candidate / hypothesis`).
- `Decided` (Sollelio, 2026-10-14, Stock migration slice) **Stock on the mobile shell**: removing an item from the Lista de compra is immediate and reversible with Undo ("Desfazer" restores membership, planned quantity and urgency) instead of a confirmation; in Modo mercado the quantity sits under the product name on mobile, so a long name keeps the row's width; Passagem with nothing bought is replaced by Stock (no dead end after the purchase is recorded); «Baixo» uses a caution status tone, distinct from «Comprar». Follow-up: the inline Undo notice is acceptable for now; once a shared Snackbar primitive exists, this Undo migrates to it.
- `Decided` (Sollelio, 2026-10-14, Private mode + Fecho migration slice) **Private mode as one nested workspace**: every private screen carries a private bar ("Área privada · <current operating person>"); ← goes back within the private area's own history and never falls to Hoje; the area's root shows × as the explicit exit, other screens offer "Sair"; leaving the area ends the private context (07 §8). Anular launched from a private surface runs inside the private area; after success "Voltar" is the primary action and "Registar de novo, com o valor certo" is secondary, saying that the public capture flow ends the private context. On a closed period, Reabrir — and likewise Anular aprovação — sits at the end of the content as an exceptional destructive action, never in the bottom action bar; Fechar período stays a primary completion action. Profissionais is ordered exception-first: Decidir → A rever → Pronto. Sensitive drafts are not persisted across private-session expiry; after expiry the person may need to re-enter a draft (the intended destination is kept).
- `Decided` (Sollelio, 2026-10-14, Negócio migration slice) **Negócio on the private mobile shell**: on Visão geral and Finanças, "Precisa da tua atenção" comes immediately after the summary, before "O que mudou?"; an insight's explanation opens in a bottom sheet (back closes it first) rather than expanding inline; for a `team.finance.read` holder, the whole professional row on Negócio → Equipa opens that person's Situação (no separate "Ver situação completa" button). Privacy, redaction and inference protection (07 D9 · B11) are unchanged: every figure is the redacted read's, nothing is derived on the client. Follow-up: the app bar title now wraps to two lines instead of being cut; review it in the final visual refinement so short-title screens have not become unnecessarily tall.
- `Decided` (Sollelio, 2026-10-14, Gestão migration slice) **Catalogue deactivation is an explicit action**, not an "Ativo / Desativado" toggle: "Desativar serviço/produto" is a destructive action at the end of the editor that opens the existing Confirmação necessária (catalogue.manage, one-shot PIN), whose final action is destructive; it is the same `catalogue_update_*` command with `active: false`, nothing is deleted, and pending field edits may be confirmed together with it. A deactivated entry offers a secondary "Reativar" through the same confirmation.
- `Decided` (Sollelio, 2026-10-14, PWA installability slice) **Installable, online-only**: the app is an installable web app (manifest: "Sollelio Beauty OS" / "Beauty OS", standalone, start and scope `/`) with **no service worker** — nothing is cached and it needs the network, as before (D5). *(Online-only status superseded on 2026-10-15 by [ADR-0010](architecture/adr/0010-offline-capture-and-sync.md): Offline V1 adds a static-shell service worker and offline capture as listed in the Connectivity entry below; the installability and icon decisions here are unchanged.)* Its icons and favicons are the approved **Sollelio Beauty OS brand package v0.1** (Sollelio, 2026-10-15; Precision Violet accent): the dark app icon as supplied (192 / 512), its full-bleed maskable and Apple variants (the same artwork without the tile's corner radius; the symbol is not rescaled), the supplied favicons and the isolated Beauty OS symbol; theme `#11152D`, background `#F7F4EE` (`manifest-colours.json`). The temporary Sollelio master-avatar placeholder is no longer used. Follow-up: under the strictest maskable safe-zone circle (40% radius) the symbol's square top-left corner reaches about 40.6%, so a few pixels of that corner tip may be cut; if needed, brand supplies a maskable export — the artwork is not changed here.
- `Decided` (Sollelio, 2026-10-16, learning experience L0) **Learning experience: Brand Splash, Interactive Guide, Help Center** — approved design references; the Brand Splash is implemented (L1), the rest is not ([learning experience](design/learning-experience.md)): a brand moment shown **only while the app is really loading**, never a minimum or a delay; an optional, isolated interactive guide on synthetic data that records nothing (first: «Como registar um serviço»; Android Back steps back, exiting at the first step; exit returns to where it was opened); a Help Center reached from **one *Ajuda* row at the end of Hoje**, available **only after enrollment**, common to all tenants, explaining private workflows generically without exposing protected data, with written steps and short **microanimations** (no videos; played only on request; static under reduced motion). No navigation change, no new global theme; the app's Indigo accent stays. Help content must match the real offline contract: services sync only while Beauty OS is open and connected and may end «para rever»; Adiantamento, Despesa and Compra drafts need an online PIN confirmation; stock state changes need *Guardar* online; *Misto* exists only with exactly two payment methods.
- Tablet and desktop later **adapt layout and information density**; they do not merely stretch the mobile UI.
- Core operational workflows stay excellent on the smartphone regardless of larger-screen layouts.
- ~~`Decided` **Connectivity in V1** ([07 §2 D5](07_PRE_IMPLEMENTATION_GAP_CLOSURE.md#d5--connectivity-a1-saving-requires-a-network-connection)): saving requires a network connection; on a recoverable network/save failure the entered data is preserved and the person can retry. No offline queue, offline persistence/sync engine or conflict resolution in V1. Offline/PWA sync may be revisited after pilot evidence.~~ **Superseded in part (Sollelio, 2026-10-15) by [ADR-0010](architecture/adr/0010-offline-capture-and-sync.md).**
- `Decided` (Sollelio, 2026-10-15, Offline 0) **Connectivity — Offline V1** ([ADR-0010](architecture/adr/0010-offline-capture-and-sync.md)): **Registar serviço** works fully offline (saved on the device, synchronized later, never shown as "Registado" until synced); **Adiantamento, Despesa and Compra** can be saved offline as device drafts that become records only after the online PIN confirmation; the **Mercado trip** stays a local draft; **Hoje** and the **Stock overview** show dated, read-only cached data offline. **Online only:** the private area (entry, Equipa, Situação), Fecho and all its flows, Negócio, Gestão, Anular, Rever stock, Stock and Lista edits, enrollment and PIN verification — for these, a failed save still keeps the entered data and retries the same `command_id`. Offline is always visible and calm ("Sem ligação"; "Guardado neste telemóvel · será enviado quando houver ligação"; "Guardado neste telemóvel · por confirmar com PIN"); local pending counts never mix with server totals. A period cannot be approved or closed until the server knows every active offline-capable device is synchronized for it. *Amended (Sollelio, 2026-10-15, Offline 8): the cached Hoje and Stock overview and starting a Mercado trip offline are deferred from the Offline V1 pilot scope ([ADR-0010](architecture/adr/0010-offline-capture-and-sync.md) §1, pilot-scope amendment).*

## 3. Operator and authorization model — `Decided` (concepts only)

Do **not** force repeated full login/logout on the shared device for ordinary actions.

Three distinct concepts:

| Concept | Meaning |
|---|---|
| Organization / device context | The device is authenticated as belonging to an organization. |
| Current operator | Who is acting right now (may change many times a day on a shared device). |
| Authorization for sensitive actions | Extra confirmation that the operator may perform this action. |

- `Candidate / hypothesis` Sensitive actions may use lightweight re-verification (e.g. a manager PIN).
- `Open / requires validation` Which actions are sensitive. Candidates from the journeys: confirming advances (J2), approving payables, closing and reopening periods (J5), correcting recorded financial events. Minimum product-level boundaries for architecture: [07 §8](07_PRE_IMPLEMENTATION_GAP_CLOSURE.md#8-product-level-authorization-boundaries) (who holds each one stays open).
- `Open / requires validation` Auth architecture — not to be designed or finalized yet.

## 4. Shared-device privacy — `Decided`

> On a shared salon device, successful operational capture must not automatically reveal sensitive professional financial information to whoever is holding the device.

Concepts (no auth, PIN or RBAC design implied):

| Concept | Meaning |
|---|---|
| Current operator | Who is acting on the device now (§3). |
| Sensitive financial information | Detailed earnings, remuneration split, accumulated balance, or any other person's financial situation. |
| Authorization boundary | What the current operator, in the current context, is authorized to see. |

Consequences:

- Recording a service (J1) shows a **neutral success confirmation** by default.
- Recording an advance (J2) shows only the information appropriate to the current operator's authorization.
- Sensitive financial information requires an **authorized / private context**.
- Professionals do not automatically see other professionals' sensitive financial information (J4).
- *Show consequences immediately* ([06](06_DESIGN_PRINCIPLES.md) #2) still applies, but **only within the viewer's authorization boundary**.

`Open / requires validation` How the authorized/private context is established (mechanism not designed); how sensitive exceptions are presented on Hoje.

`Open / requires validation` **Per-record service prices on shared surfaces.** A service's price is catalogue information (the customer pays it), not remuneration. But a list of today's records with names and prices lets a device holder add up a colleague's daily production. Recommendation and the evidence needed to close this: [Slice 01 §8b](design/slice-01-hoje-registar-servico.md#8b-service-prices-in-recent-activity-on-the-shared-device).

## 6. Product identity vs tenant identity — `Decided`

Brand architecture and palette: [00 · Brand architecture](00_PRODUCT_CONTEXT.md#brand-architecture--decided-supplied-by-sollelio).

**Sollelio owns the product experience.** The following are product-system decisions, identical for every organization:

- interaction patterns and core workflows;
- typography;
- spacing, layout logic and information architecture;
- component system and structure;
- semantic colour roles (error, warning, success, information, selection);
- accessibility rules;
- overall visual/product character.

**An organization (tenant) may contribute controlled identity:**

- business name — V1;
- business logo — V1;
- `Candidate / hypothesis` a limited accent/brand colour — later, only if evidence requires it.

Tenant identity must **not** redefine semantic colours, typography, component structure, layout logic, accessibility rules or core interaction patterns. This is **not** a white-label system ([03 §4](03_V1_SCOPE.md#4-explicitly-not-v1--decided)). For V1, name + logo are sufficient.

Pilot reference: the Salão Agradável logo is a tenant asset. The application's colour system, typography, structure and interactions are not derived from it.

### Accent status in design slices

- `Decided` (Sollelio, 2026-10-15) The Beauty OS **brand** accent is **Precision Violet** — the accent plane of the symbol in the brand package v0.1, used in the icons, favicons, lockups and splash ([00 §1](00_PRODUCT_CONTEXT.md#brand-architecture--decided-supplied-by-sollelio)).
- `Open / requires validation` The product **UI** accent token is **not chosen**. The app uses Sollelio master Mineral Indigo as its interactive accent ([Slice 01 §12](design/slice-01-hoje-registar-servico.md#12-visual-token-neutralization-pass-2026-10-05)); it stays during the learning-experience slices (2026-10-16). Any accent in a design slice remains a token to be swapped, not a decision.
- `Open / requires validation` The product UI typeface is not chosen. It is a separate decision from lockup typography (Rubik); Slice 01 uses Instrument Sans provisionally.
- Semantic colours (warning, error, success) are product-system tokens and must stay distinguishable from both the product accent and the other Sollelio product accents (Teal, Amber).

## 7. Remuneration determinacy in the experience — `Decided`

Rule: [03 §3](03_V1_SCOPE.md#determinate-vs-contextual--pending-remuneration--decided). Journey behaviour: [04 · J1](04_CORE_USER_JOURNEYS.md#j1--record-completed-service).

Within the authorization boundary:

- **Determinate** remuneration may be shown as a calculated split.
- **Contextual / pending** remuneration is shown as *pending determination / not yet final* wherever it appears (capture confirmation, Equipa, Fecho). A provisional figure is never presented as final.
