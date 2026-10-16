# Learning experience — Brand Splash · Interactive Guide · Help Center

**Status:** design references **approved** (Sollelio, 2026-10-16), corrected in L0 (§4). **Nothing is implemented**: the phased plan is §7; each slice is implemented only when explicitly requested.
**Canonical for:** the learning-experience scope, its three approved design references, the behaviour their content must respect, the brand assets it needs and its implementation plan. Product-level decisions are summarised in [05 §2](../05_PRODUCT_EXPERIENCE_MODEL.md#2-device-constraints-and-form-factor); scope in [03 §2](../03_V1_SCOPE.md#2-must-have-candidate-capabilities--candidate--hypothesis); brand in [00 §1](../00_PRODUCT_CONTEXT.md#brand-architecture--decided-supplied-by-sollelio).

Status tags as in [00](../00_PRODUCT_CONTEXT.md#status-vocabulary-used-in-all-docs).

---

## 1. Decisions — `Decided` (Sollelio, 2026-10-16)

- **Brand architecture:** Sollelio is the masterbrand; Sollelio Beauty OS is the product; salons are tenants. Salão Agradável is the first tenant and founding design partner. Visual direction: **product first, salon second**.
- **No redesign**, no white-label architecture, no new global theme system. The existing app-wide Indigo accent (`--accent: #3030A8`) is **not** replaced during these slices.
- **Three components**, with approved design references (§2), subject to the L0 corrections (§4).
- **No mandatory videos and no repeated onboarding.** Tutorial videos are not produced; **educational microanimations** replace them.
- **Brand Splash never introduces a minimum startup delay.** It is presentation during real loading only; the official **compact** Beauty OS lockup is preferred.
- **Help is available only after device enrollment** (unbound devices see only enrollment, ADR-0009).
- **Entry point:** one discreet **Ajuda** row in Hoje. No other navigation change.
- Help content is **common to all tenants**, with **synthetic** demonstrations. Public Help may explain private workflows **generically** and never exposes protected data.
- A tutorial's completion or exit **returns to the context it was opened from**.
- **Android Back inside a tutorial** goes back one step; at the first step it exits the tutorial — provided this does not conflict with the existing back contract (05 §2; checked in L4b).
- **Tenant name and logo** integration is a **separate scope** (§8).

**Confirmed at L0 review (Sollelio, 2026-10-16):**

- **Brand assets** are stored under `sollelio-brand-assets/beauty-os-v0.1/`, the original package preserved unmodified; importing them is **L1 preparation** (§5).
- **Enrollment-screen logo docking** is **deferred** and **excluded from L1**.
- **Demonstration data:** synthetic names, services and amounts; money shown in the **tenant's configured currency** where applicable; never operational prices or financial records.
- **Help copy** is proposed by the team, verified against the implementation, then **approved by Hélio** before release.
- **Detailed private-area tutorials** are **deferred**; generic public explanations remain permitted.
- The **global UI accent and typography** remain unchanged.
- **Release gates:** real-device performance and **iOS** validation remain explicit gates before release.

## 2. Approved design references

Private claude.ai canvases (open only to the owner until shared). Versions are the ones corrected in L0.

| Component | Canvas | Version |
|---|---|---|
| Brand Splash | https://claude.ai/artifact/Hg69CBPrf7DaoUoNUkob8D | v6 · `1792108173-3681` |
| Interactive Guide «Como registar um serviço» (V4) | https://claude.ai/artifact/6czszHyHFFFWATRwHeN45Z | v6 · `1792108068-b71b` |
| Help Center (V6) | https://claude.ai/artifact/SmXo7mjF9zUCVD2cFEgwoY | v10 · `1792108035-b6f7` |

The prototypes are **hand-made reproductions** of the app's screens, not code. Implementation uses the app's real components and tokens; it never copies prototype markup or the prototypes' accent tweak.

**What each reference fixes**

- **Brand Splash.** Same ground as the OS launch screen (`#F7F4EE`); the four official symbol planes revealed (0 / 70 / 140 / 240 ms, 320 ms each), then the official compact lockup (560–800 ms); «A carregar…» after 1500 ms if still loading; on ready, brand fades 200 ms and the app fades in; reduced motion = the static final frame. Docking the lockup onto «Ligar este dispositivo» is shown as an optional variant (off by default); it is **deferred and excluded from L1** (§1).
- **Interactive Guide V4.** The real three-step *Registar serviço* flow under a persistent «Demonstração · nada fica registado» band; six coach steps over four screens (Joana → Corte → Editar → Transferência → Confirmar serviço → success); one highlighted control per step; tapping it advances, «Seguinte» / «Anterior» / «Sair» / «Recomeçar» as alternatives; the app's own × and ← keep their app meaning; nothing is recorded.
- **Help Center V6.** Hoje → Ajuda (search · featured guide · topics in *Dia a dia*, *Sem ligação*, *Área privada · com PIN*) → Tema (Passo a passo · Animação · Tutorial, each with its own state) → Passo a passo. Three microanimations (Misto, stock state, offline), each played only on «Ver», never looping, replayable, static frames under reduced motion. No video anywhere.

## 3. Verified behaviour the learning content must respect

Facts from the code on `dev` (6fca0d6); the learning content may never contradict them.

| Topic | Behaviour | Source |
|---|---|---|
| Startup | `DeviceGate` shows «A carregar…» until the device context is known; an enrolled device asks `device_context` (after `auth.getSession()`, which may refresh the session) on **every cold launch** — the query cache is not persisted. A browser with no stored session resolves as unbound **without** a network call. Offline, a previously bound device opens on its cached binding. | `src/app/DeviceGate.tsx`, `src/modules/org/api.ts:14`, `src/shared/query/queryClient.ts` |
| First paint | `index.html` has an empty `#root` and no inline style; one 890 KB JS chunk (244 KB gzip) and one 28 KB CSS file; no code splitting. | `index.html`, `dist/` |
| Service worker | Precaches the build's HTML, JS, CSS, manifest and icons; offline app navigations get the shell; no runtime caching; no `skipWaiting` (a new version takes over once every window has closed). Any lazy chunk is precached automatically. | `pwa/sw.js`, `pwa/serviceWorkerPlugin.ts` |
| Service sync | Only **Registar serviço** is sent automatically, and only **in the foreground** while Beauty OS is **open and connected** (start, reconnect, gentle retry, «Enviar agora»), oldest first. A rejected item becomes a **conflict** shown as «para rever» (e.g. captured > 48 h before sync, period approved/closed, referenced item deactivated). Offline capture needs a capture snapshot < 48 h old. | ADR-0010 §1, §2, §9, §10; `src/shared/offline/coordinator.ts`; `src/shared/offline/OfflineRuntimeProvider.tsx:114-132`; `src/modules/services/offline.ts` |
| Movement drafts | **Adiantamento, Despesa, Compra** offline are drafts «por confirmar com PIN»; they become records **only** after an explicit online PIN confirmation; never sent automatically. | ADR-0010 §3; `src/spaces/rascunhos/copy.ts:8` |
| Stock state | Tap the product → product sheet (Estado: OK · Baixo · Comprar; level; reserve; list) → **Guardar**, online only. «Comprar» also puts the product on the list. | `src/spaces/stock/StockPage.tsx:120-184`; ADR-0010 §1 |
| Misto | Offered only when the organization has **exactly two** active payment methods. | `src/shared/payment.ts:32` |
| Gestão | Reachable only from private **Equipa** for `catalogue.manage` holders; a catalogue-only holder without team-finance access has no visible path (an existing app gap, not a learning-experience change). | `src/spaces/privado/EquipaPage.tsx:42`, `src/app/PrivateGate.tsx` |
| Tenant identity | `organizations` has `name`, no logo column; no screen renders the organization name. | `supabase/migrations/20261007000100_org_identity.sql`; `src/` |

## 4. L0 corrections to the design references (2026-10-16)

Targeted factual corrections only; layout, navigation and structure unchanged.

| Reference | Before | After |
|---|---|---|
| Help · animation «O que acontece sem ligação» | «Voltou a ligação: enviado sozinho. Agora é Registado»; «A app envia sozinha, por ordem» | Services are sent while Beauty OS is open and connected, oldest first; if the server does not accept one it stays «para rever»; new final frame: Adiantamento, despesa e compra wait for a PIN confirmation |
| Help · Adiantamento tip | «…só passa a registo quando houver ligação» | Never sent automatically; becomes a record only when someone confirms it with PIN, online |
| Help · «Trabalhar sem ligação» | «…é enviado quando houver ligação»; «…eles seguem sozinhos» | Sent with the app open and connected, possibly «para rever»; drafts wait for the PIN; Stock edits need a connection; the 48-hour condition for offline capture |
| Help · stock animation and steps | Tap the product, then Comprar, and the state changes | Product sheet → state → **Guardar** (needs a connection); «Comprar» also lists it |
| Help · Misto animation and steps | Misto presented as always available | «só aparece quando o salão usa exatamente duas formas de pagamento» |
| Help · Anular tip, Gestão steps | — | «Anular precisa de ligação»; Gestão «só aparece a quem gere o catálogo» |
| Help · canvas | Content map dragged off its board into the entry-point board | Restored to «Arquitetura, mapa de conteúdos e decisões», statuses updated; entry A marked approved, B deferred |
| Guide V4 · steps 4 and 5 | «Misto divide o valor…»; «…é enviado depois» | Misto only with two payment methods; «Sem ligação, fica neste telemóvel e segue quando o Beauty OS abrir com ligação»; Android Back rule recorded |
| Splash · timing | Skip below 150 ms; ≈ 800 ms minimum on first launch; "warm sessions resolve in tens of ms" | No threshold and no minimum; brand only while really loading (JS boot + device context); cold launches of an enrolled device always ask the server; first launch only covers the JS boot; docking variant optional, off by default (since deferred, excluded from L1 — §1) |

**Still in the references, deliberately not changed in L0:** demonstration amounts are shown in «Kz» — illustrative only; the implementation uses the tenant's configured currency (§1; CLAUDE.md rule 7); the Help canvas keeps the prototype's own accent rendering.

## 5. Brand assets

- **Package:** *Sollelio Beauty OS — Brand Assets v0.1* (Precision Violet), supplied by Sollelio as `sollelio-beauty-os-brand-assets-v0.1.zip` (35 entries; SHA-256 `589b410125748db318a75611ad0f8fba1552e110d5cfb3014b242155ccf206d6`). Its README defines the architecture (Sollelio → Sollelio Beauty OS → tenants), the palette (Mineral Indigo `#3030A8`, Precision Violet `#7657D6`, Violet on dark `#9A7CF0`, Warm Graphite, Warm Off-white, Midnight Indigo, White) and the usage rules (compact lockup only where the Sollelio context is established; splash short and non-blocking; tenant names and logos never inside the Beauty OS logo; no gradients, shadows, salon imagery or `B`/`BOS` monogram).
- **Not version-controlled.** The package exists only outside the repository. The repository holds only what the PWA slice copied into `public/` (favicons, the isolated symbol as `favicon.svg`, the dark 192/512 icons byte-identical; maskable and Apple variants derived) and the masterbrand package in `sollelio-brand-assets/`.
- **Canonical location** (`Decided`, 2026-10-16): `sollelio-brand-assets/beauty-os-v0.1/` — the whole package, unmodified, with its README (non-runtime; CLAUDE.md: brand assets live in `sollelio-brand-assets/`). Added unmodified in L1 (34 files; the symbol, the compact outlined lockup and the README pinned by SHA-256 in `tests/pwa/pwa.test.ts`).
- **Needed by L1:** `sollelio-beauty-os-symbol.svg` (SHA-256 prefix `0a9674443d239316`, = `public/favicon.svg`) and `sollelio-beauty-os-logo-compact-outlined.svg` (`f5cf66bec696e367`; typography outlined, no font dependency). Reference only: `sollelio-beauty-os-splash-light-outlined.svg`, `brand-preview-sheet.png`, `manifest-colours.json`, `README.md`. L2–L4b need no brand asset (Help carries no brand mark).
- **Accent and lockup status:** the brand package v0.1 is approved (Sollelio, 2026-10-15; 05 §2): product name *Sollelio Beauty OS* / *Beauty OS*, the Precision Violet accent **plane of the symbol**, and the lockups. Separately and still `Open`: the **UI** accent token (the app keeps Indigo) and the **UI** typeface. See 00 §1 and 05 §6.

## 6. Approved design vs implementation

| Component | Design | Implemented |
|---|---|---|
| Brand Splash | Approved (corrected) | **L1 on `dev`** — `index.html` overlay (official artwork inlined from `sollelio-brand-assets/beauty-os-v0.1/`), `src/app/bootBrand.ts`, `src/app/BootBrandGate.tsx`; held only by `DeviceGate`'s loading states. Real-device and iOS validation pending (§1 release gates) |
| Interactive Guide | Approved (corrected) | **L4a on `dev`** — the Registar serviço screens extracted unchanged into props-only parts (`src/spaces/servicos/RecordServiceViews.tsx`), rendered by `RecordServiceFlow`; the guide itself (L4b) is not implemented |
| Help Center, entry row | Approved (corrected) | **L2 on `dev`** — the *Ajuda* row at the end of Hoje; lazy routes `/ajuda`, `/ajuda/:tema`, `/ajuda/:tema/passos` under `DeviceGate` (`src/spaces/ajuda/`); 12 written topics verified against the implementation, pending Hélio's copy approval; a topic lists only usable content (animation and tutorial appear when L3/L4 deliver them); a failed help load shows a retry and «Voltar ao Hoje» |
| Microanimations | Approved (corrected) | **L3 on `dev`** — Misto (Registar um serviço; example amounts for AOA and EUR only — any other currency gets a still explanation without amounts), Stock and Sem ligação, on those three topics only (`src/spaces/ajuda/demos.tsx`, `microanimations.css`, primitive `src/shared/ui/Microanimation.tsx`); played only on «Ver», once, replayable; static frames under reduced motion; text equivalent for screen readers; Misto sentences from the app's own payment check in the organization's currency; in the precached help chunk |

## 7. Implementation plan (L1–L4b)

Each slice is independently testable and implemented only on explicit request. Common constraints: no change to authentication, PIN, permissions, tenant isolation, offline runtime, database or operational flows; no new global styles; the app-wide Indigo stays; pt-PT copy; tests in the existing Vitest/jsdom and `tests/pwa` suites, manual checks on the pilot Android (iOS remains the open pre-pilot gate).

**L1 · Boot brand**
- Scope: inline `html, body` background `#F7F4EE`; a static brand overlay **beside** `#root` in `index.html` (official symbol and compact lockup inlined verbatim from the package; CSS keyframes; static final frame under `prefers-reduced-motion`); `DeviceGate` removes it as soon as it reaches any outcome (Hoje, enrollment, cached binding, «Sem ligação… pela primeira vez», «Não foi possível ligar ao servidor») and `main.tsx` removes it on the configuration-error path. No timer, no minimum.
- Acceptance: overlay removed in every outcome; no boot timer or minimum; median time to an interactive Hoje over 10 cold starts on the pilot Android ≤ baseline + 50 ms; main bundle growth ≤ 3 KB gzip; offline cold start unchanged.
- Tests: extend `DeviceGate.test.tsx` and `coldStart.test.tsx` (removal per outcome); `tests/pwa`: `dist/index.html` contains the overlay, no external resource, background equals the manifest's; inlined paths equal the package files; source scan for timers in boot code. Manual: installed PWA cold starts online, offline, first launch, revoked device; reduced motion on.

**L2 · Help Center (written content and entry point)**
- Scope: lazy routes `/ajuda`, `/ajuda/:tema`, `/ajuda/:tema/passos` under `DeviceGate` (not under `RequireConnection` or `PrivateGate`) in `src/spaces/ajuda/`; one *Ajuda* `ListRow` at the end of Hoje; local search; the corrected topics as typed pt-PT data; no data hooks.
- Acceptance: available offline after one online launch; back returns to the opener, a deep link falls back to `/ajuda`; zero Supabase, IndexedDB or storage access; private topics generic; main bundle growth < 1 KB gzip.
- Tests: routing and back; search and empty state; a render with the Supabase client mocked to throw; build test that the help chunk is precached; **label drift test** (every UI label a topic cites exists in `src/spaces/**`). Manual: airplane mode, shared-device walkthrough.

**L3 · Microanimations**
- Scope: one shared primitive in `src/shared/ui/` (play on «Ver», no loop, replay, static frames under reduced motion, `aria-hidden` stage with a text equivalent) and the three corrected animations.
- Acceptance: nothing plays on mount; each run ≤ 5 s; no infinite animation; reduced motion shows the static frames.
- Tests: a `matchMedia` mock in `src/test/setup.ts`; no-autoplay, replay and reduced-motion tests; source scan for `infinite`. Manual: smoothness on a low-end Android.

**L4a · Behaviour-preserving extraction**
- Scope: extract presentational step components from `RecordServiceFlow.tsx` so the real flow and the guide render the same controls.
- Acceptance: no user-visible change; `RecordServiceFlow*.test.tsx`, `coldStart.test.tsx` and `DeviceGate.test.tsx` pass unchanged.

**L4b · Interactive Guide «Como registar um serviço»**
- Scope: an isolated sandbox (synthetic data as props; no `useRecordService`, `useCaptureData`, Supabase or offline store), coach, single highlight, persistent demonstration band, return to the opening Help topic, the Android Back rule (§1), history steps with no «Descartar?» prompt and no `beforeunload`.
- Acceptance: completing all six steps causes no network call and no IndexedDB or localStorage write; the band is always visible; works offline.
- Tests: runtime isolation test (Supabase mocked to throw; IndexedDB and storage spies); an ESLint `no-restricted-imports` rule for the sandbox folder; back-behaviour tests. Manual: walkthrough with the pilot.

**L1 readiness conditions**
1. The brand package added unmodified at `sollelio-brand-assets/beauty-os-v0.1/` (§5) — L1 preparation.
2. L1 without the docking variant (deferred, §1).
3. A measured baseline: cold-start time to an interactive Hoje on the pilot Android (10 runs, online and offline).
4. The L1 acceptance criteria above accepted as the definition of done.

Release gates for every slice (§1): real-device performance and iOS validation.

## 8. Deferred

- **Tenant name and logo** (05 §6, `Decided` for V1, not implemented; no logo column exists) — separate scope. When it lands, tenant identity appears only after the device context is resolved, never in the splash.
- Contextual «?» help entry in flow app bars (Help V6 option B).
- Microanimations inside the interactive guides (a later guide version).
- Detailed interactive tutorials for private workflows (generic public explanations remain permitted).
- Lockup docking onto the enrollment screen (excluded from L1).
- A browser end-to-end harness (ADR-0008 lists `e2e/`; it does not exist yet).
- iOS launch images (`apple-touch-startup-image`).

## 9. Open questions — `Open / requires validation`

Resolved at the L0 review (§1): splash docking (deferred), brand-package placement, demonstration data and currency, help-copy approval, private-area tutorials (deferred).

1. **The Gestão path** for catalogue-only permission holders (app gap, §3) — **deferred** (L2 review, 2026-10-16): the help describes the current route through *Equipa* as the current path, not as a permission rule, and tells a catalogue manager who cannot find it to contact the salon's manager; it changes only if the app's navigation does.
2. **iOS** physical validation (existing pre-pilot gate) — a release gate for the splash and help offline behaviour.

## 10. Architecture

No new ADR is needed. Help content and the guide are static build files served by the existing static-shell service worker (ADR-0010 §7); they persist nothing and add no offline capability to ADR-0010 §1. The splash is presentation inside the existing startup. New UI goes in `src/spaces/` and `src/shared/ui/` (ADR-0008); no new data module. A need for an ADR would arise only if implementation required persistence, runtime caching or a change to startup authority.
