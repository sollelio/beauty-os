# Beauty OS — Architecture Definition

**Status:** approved (Architecture Definition checkpoint, 2026-10-06). ADR-0001…0009 are Accepted (ADR-0009 at the device/verification spike checkpoint, 2026-10-06; physical iOS Safari validation deferred, §23.6). Documentation only: no code, configuration, infrastructure or schema exists or is implied by this document.
**Baseline:** `a39f96d` — product canon [docs/00–07](../07_PRE_IMPLEMENTATION_GAP_CLOSURE.md) and the six approved slices in [docs/design/](../design/).
**Decision records:** [adr/](adr/) (ADR-0001 … ADR-0009).

### Markers used in this document

| Marker | Meaning |
|---|---|
| **Constraint** | Technical direction already agreed by Sollelio before this document (stack, hosting, monolith, RLS as boundary). |
| **Product** | A product rule taken from the canonical docs; cited, never changed here. |
| **Defined** | An architecture decision made in this document (and its ADR), pending checkpoint review. |
| **Spike** | Requirement fixed by §23; mechanism chosen by the spike and recorded in ADR-0009 (Alternative A). |
| **Deferred** | Architecture decision intentionally postponed until implementation evidence exists (§21). |
| **Open product** | Product behaviour still unresolved in the canon. It does not block this Architecture Definition or the device/verification spike, and its answer should not invalidate the system and module boundaries. Its answer may require **additive** schema, command, state-transition or constraint changes, which are not pre-designed here (§21.1). The architecture does not decide it. |

The Architecture Planning report of 2026-10-06 is an input, not canon. Where this document differs from it, this document applies (§1.2).

---

## 1. Architecture status and scope

### 1.1 Scope

In scope: the structure of one modular-monolith web application on Supabase/PostgreSQL; module boundaries; identity, authorization and RLS model; the trusted-command write model; financial calculation authority; period lifecycle, review concurrency and idempotency; historical stability and audit; frontend structure; testing; repository organization; delivery strategy; the specification of the device/elevation spike.

Out of scope: final SQL schema, columns, migrations, RLS policy text, function signatures, Edge Function code, UI design, product behaviour.

### 1.2 Refinements relative to Architecture Planning

| Planning proposal | Definition |
|---|---|
| Approval concurrency via a generic period version | A dedicated **review revision** per period, changed transactionally by every command that can alter review results (§11, ADR-0005). |
| Record UUID as idempotency key | A separate **`command_id`** with a command journal and payload fingerprint (§12, ADR-0006). |
| Commands "with definer rights or invoker rights" | **SECURITY DEFINER command contract** with explicit EXECUTE restriction, fixed `search_path`, server-resolved actor, and no assumption that caller RLS applies (§9, ADR-0003). |
| Closed periods recomputed indefinitely; snapshot deferred | **Historical stability**: approval outputs and a **close statement** with a calculation version are persisted; closed periods display persisted outputs (§14, ADR-0007). |
| Device principal via anonymous sign-in + elevation grant table (recommended) | **Not chosen.** Requirements, alternatives and acceptance criteria only; the spike decides (§7, §23, ADR-0009 *Proposed*). |

## 2. System context

| Actor | Device | Typical actions |
|---|---|---|
| Shared salon device (organization context) with a declared current operator | The salon's smartphone (`Confirmed`, 05 §2) | Record services; prepare advances, expenses, purchases; Stock state, lists, market mode (B1) |
| Authorized person confirming on the shared device | Same device | *Confirmação necessária* for advances, expenses, purchases (B2); entering a private context (B3–B5, B7–B10) |
| Person on a personal device | Own phone/laptop | Remote payment confirmation by finance (B6, 01 §1); own situation later (05 §2) |
| Sollelio operator | Admin tooling, outside the product UI | Organization provisioning |

| External dependency | Use |
|---|---|
| Supabase PostgreSQL (+ PostgREST) | **Constraint.** All data, RLS, command functions, derivations |
| Supabase Auth | **Constraint.** Principals and sessions |
| Supabase Edge Functions | **Constraint.** Only for trusted operations needing secrets or admin capability (§16) |
| Supabase Storage | **Constraint**, used only for the organization logo (05 §6 — the only V1 file) |
| Netlify | **Constraint.** Static hosting of the web application |

No other external dependency is justified by the product. A delivery channel for remote-person sign-in (email or SMS) may become one (§23, SQ-11).

**Responsibilities.** The frontend owns interaction, presentation, client-side input checks for UX, the market-trip draft, and calling queries and commands. PostgreSQL owns tenancy, authorization, invariants, state transitions, financial derivations, attribution and business history.

## 3. Trust boundaries

| Zone | Trust | Rule |
|---|---|---|
| Browser | **Untrusted** | Holds only the public (anon) key and the session of its principal. **The service-role credential never reaches the browser** (Constraint). UI hiding is never authorization (Constraint). |
| PostgREST + PostgreSQL | **Authoritative** | RLS and trusted command functions decide every read and write. |
| Supabase Auth | Identity provider | Issues sessions; does not by itself grant organization access. |
| Edge Functions | Trusted server-side | May hold secrets or the service role for narrowly scoped admin operations; never expose them. |
| Storage | Authorized by policies on stored objects | Organization-scoped paths. |

**Defined — sensitive delivery rule:** sensitive data is not *returned* to a context that may not read it. Filtering after delivery (in the browser) does not count (07 §8).

## 4. Domain / module boundaries

**Constraint:** one deployable modular monolith. **Defined:** eight domain modules; *Hoje* is a read composition, not a domain. UI placement does not determine ownership (e.g. reserve actions are shown in Fecho but owned by `money`).

| Module | Owns (source of truth, writes) | Main read contracts it offers |
|---|---|---|
| `org` | Organization; settings (currency and precision, timezone, configurable lists: payment methods, expense categories, purchase origins, unit words); people and their independent dimensions (00 §5); permission grants; devices; verified-actor context | Actor context; people (operational fields); settings |
| `catalogue` | Services and default prices | Catalogue for capture |
| `services` | Service records (production) | Records per person/period; production totals |
| `team` | Advances; standing remuneration-rule versions (D4) | Advances per person/period; rule resolution; person situation |
| `purchasing` | Purchase (lines, contributions, origin, substitution note) | Purchase lines per product; salon part; contributions |
| `money` | Expenses; reserve allocations and uses (D1) | Expenses; reserve movements and balance |
| `stock` | Products; human state (OK/Baixo/Comprar) and its history; approximate level; reserve units; plan/list/urgent | Stock home; purchase history per product (from `purchasing`) |
| `period` | Period lifecycle; contextual rule decisions; owners' decision (D3); approvals and annulments; payments to professionals; close; reopen; review revision; close statements | Review/position read model; readiness and exceptions; decision history |

Payments live in `period` because a payment exists only against an approval (Slice 06 §8).

## 5. Dependency rules

1. **A module writes only its own tables**, and only through its own commands (§9) or, for the low-risk cases in §16, its own direct writes.
2. **Cross-module consumption is through read contracts**: named views or query functions that the owning module publishes. A module never reads another module's tables in an undocumented way and never writes them.
3. Direction: `org` ← all; `catalogue` ← `services`; `purchasing` ↔ `stock` (product reference only); `money` reads `purchasing`; `team` and `period` read each other's contracts; `period` reads all. Cycles are allowed only between read contracts, never between writes.
4. **Commands that span modules are owned by one module** and read the others' contracts inside the same transaction (e.g. `period` approval reads `services`, `team`, `money`, `purchasing` contracts).
5. Frontend mirrors the rule: `spaces → modules → shared`; a module's UI calls only its own access layer, and another module's published queries (§15).

## 6. Data architecture principles

| # | Principle | Basis |
|---|---|---|
| D-1 | **Every row belongs to one organization.** Tenancy is never taken from client input. | Product 00 §3; 07 §8 B0 |
| D-2 | **Financial, production and decision records are append-only.** Corrections, rule changes, annulments and reopenings are new records referencing what they change. | Product 04 J1, J5; 07 §10.1 |
| D-3 | **Persist facts and decisions; derive figures.** Exceptions are the persisted outputs defined in §14 (approval outputs, close statements). | 07 §10.2 (extended by §14) |
| D-4 | **Periods are explicit entities** with bounds and the four `Decided` states; never derived from the calendar month. | Product 03 §2; 07 §10.3 |
| D-5 | **Each event keeps its event date separately from its recording time and recorder.** Period membership follows the event date. | 07 §10.4 |
| D-6 | **Money: integer minor units, the organization's currency and precision; one currency per organization; amounts unsigned with a type; signs are presentation.** | 07 §10.6 |
| D-7 | **Organization timezone setting** for day and period boundaries. A technical setting, not a product rule. | Defined |
| D-8 | **Remuneration rules versioned per person** (standing, effective from a period) plus per-period contextual decisions; *pending* is first-class, distinct from zero. | Product 03 §3, D4; 07 §10.5 |
| D-9 | **Multiple payments per person per period are representable.** | 07 §10.9 (I2 open) |
| D-10 | **Reserve per D1**: allocations and uses as records, use linked to one expense or purchase, balance derived, use ≤ balance. | Product 07 D1 |
| D-11 | **Stock state is mutable current state with an append-only change history**; a purchase never changes it. | Product Slice 05 |
| D-12 | **No customer entity in V1.** | Product 04 J1 |

Principal entities (indicative, not a schema): Organization, Setting lists, Person (+ ownership, capability, responsibility, rule version, permission grant), Device, ServiceRecord, Advance, Expense, Purchase (+ line, contribution), ReserveAllocation, ReserveUse, Product (+ state change, plan entry), Period (+ transition, review revision), ContextualRuleDecision, OwnersDecision, Approval (+ per-person output), ApprovalAnnulment, Payment, CloseStatement, Reopen, CommandJournal, SecurityAuditEntry.

## 7. Identity and actor model

**Product** (05 §3, 07 §8): organization/device context, current operator, authorization for sensitive actions; no per-action login on the shared device; individually attributed sensitive actions; the private context does not pass to the next holder; personal devices later.

**Defined — concepts:**

| Concept | Meaning |
|---|---|
| **Principal** | The authenticated Supabase identity making a request. Two kinds: **device principal** (a shared device acting for one organization) and **person principal** (one person, e.g. on a personal device). |
| **Organization binding** | The link that lets a principal act for one organization (device binding, or person membership). Revocable server-side. |
| **Declared operator** | The person selected on the shared device for an ordinary action ("Quem fez o serviço?"). **Not verified.** |
| **Verified actor** | A person whose identity was verified server-side for a sensitive action or private context (by the spike's mechanism), or the person principal itself. |
| **Verification scope** | *One action* (a single *Confirmação necessária*) or *private session* (time-bounded access to B3–B5/B7–B10 views and decisions). |
| **Actor context** | What the database resolves for each request: organization, principal kind, device (if any), declared operator (if supplied), verified actor (if any), scope, expiry, and the verified actor's permission grants. |

**Attribution — two levels, never confused:**

- Ordinary records store *device + declared operator* (unverified) and recording time.
- Sensitive records store the *verified actor* and time. The product shows "confirmado por X" only from this level.

**Mechanism (ADR-0009, Accepted):** the device principal is a Supabase anonymous user bound to one organization by redeeming a single-use enrollment code; verification creates database-held grants bound to the device and its Auth `session_id`, scoped `one_shot` or `private_session`; the actor context checks the Auth session row, the device binding and the grant on every request. Mitigations and revocation layers: ADR-0009.

## 8. Authorization / RLS model

**Constraint:** PostgreSQL RLS is a real authorization boundary.

**Defined — permission model:** per-person permission grants per organization, mapped to the product boundaries B2–B10 (07 §8). No single `user.role`; presets may exist only as a convenience for assigning grants. Ownership grants nothing by itself (Product 00 §5). Which people hold which grants is configuration (**Open product**, 07 P1).

**Defined — data sensitivity classes:**

| Class | Examples | Readable by |
|---|---|---|
| Operational-shared | People names and capabilities; catalogue; products and Stock state, plan; service records as shown on Hoje (who, service, value, method) | Any principal bound to the organization (B1). Price visibility on the **full** Serviços list is **Open product** (07 I8, P9); its answer may need additive policy or schema changes (§21.1). |
| Personal-financial | Rules, earned, payable, excess, advances, payments, a person's contributions and situation | The person (own rows, B3) and holders of the team-finance grant (B4) |
| Business-financial | Expenses, purchases' financial detail and contributions after capture, reserve, position, *Livre*, distribution | Holders of business-finance grants (B4–B5). Who sees contribution amounts after capture is **Open product** (03 Q7); default: business-finance grant only. |
| Period decisions | Contextual rules, owners' decision, approvals, payments, close/reopen, decision history | B4–B8 grants |
| Security / configuration | Grants, devices, verification events, security audit | B10 / security-admin grant |

**Defined — RLS rules:**

1. Every table has RLS enabled. Policies scope rows to the actor context's organization.
2. Policies use one shared actor-context resolution, evaluated once per statement rather than per row.
3. Sensitive classes require the verified actor (or person principal) and the relevant grant; the device principal alone never satisfies them.
4. **Derived reads** are exposed through views that run with the caller's rights (`security_invoker`) or through query functions that check the actor explicitly. Views that would run with the owner's rights and bypass RLS are not used for sensitive data.
5. Browser roles have **no direct DML** on financial, production or period tables (§9). `SELECT` on underlying tables is granted only where RLS fully covers the class; otherwise reads go through views/query functions.
6. Storage: one private bucket for logos, organization-prefixed paths; read for bound principals of that organization, write for B10.

## 9. Trusted command architecture

**Defined (ADR-0003):** every financial, production and period mutation is an explicit **database command**: a PostgreSQL function invoked through the API. **One command = one database transaction.** No client-orchestrated multi-row writes.

Commands (minimum): record service · record advance · record expense · record purchase · allocate reserve · use reserve · set/change contextual rule · record owners' decision · approve · annul approval · confirm payment · close · reopen · later correction commands (**Open product**, I1).

### 9.1 Security contract for privileged command functions

Command functions may run as `SECURITY DEFINER` so they can write tables on which browser roles have no DML. Each such function must satisfy all of the following:

| # | Requirement |
|---|---|
| S-1 | **EXECUTE is explicitly restricted**: revoked from `PUBLIC` and from `anon`; granted only to the authenticated role (and only where the principal kind may call it). |
| S-2 | **Fixed, safe `search_path`** (empty or pinned), with every object referenced schema-qualified. |
| S-3 | **Actor and tenant are resolved server-side** from the authenticated principal and verified grants. The function never accepts `organization_id`, acting person, permissions, verification state or equivalent identity as trusted input. |
| S-4 | **Every referenced id supplied by the client is checked to belong to the actor's organization** (person, service, product, expense, period…). Cross-tenant references are rejected. |
| S-5 | **Authorization is checked inside the function** against the actor context and the required boundary (B2–B10), including the verification scope for sensitive actions. |
| S-6 | **Invariants are checked inside the function**, under the locks the command needs (§11, §17). |
| S-7 | **RLS is not assumed.** A definer function runs with its owner's rights; whether table RLS applies depends on the owner's attributes and on forced RLS. The function's own checks are the authorization; RLS is defence in depth where technically applicable (e.g. a dedicated owner role without RLS bypass and forced RLS — to evaluate at implementation). |
| S-8 | **No dynamic SQL built from client input.** |
| S-9 | **Minimal return value**: only what the caller is entitled to see; never sensitive data beyond the actor's class. |
| S-10 | **Stable domain error codes** (§17), not raw database errors, for expected failures. |
| S-11 | **Idempotency, review revision, business history and security audit** are written in the same transaction (§11, §12, §14). |
| S-12 | **Helpers that are not commands live in a schema not exposed to the API.** |
| S-13 | **Every command has negative authorization tests** (wrong organization, wrong principal kind, missing grant, missing/expired verification). |

Underlying table privileges stay minimal: browser roles hold no `INSERT`/`UPDATE`/`DELETE` on these tables; `SELECT` per §8.

## 10. Financial calculation authority

**Defined (ADR-0004):** PostgreSQL is authoritative for every derivation used by an invariant or shown as a business figure:

- production (where aggregated);
- earned = rule % × production per person per period; undefined ("—") while a contextual rule is pending (Product 03 §3, D4);
- remaining payable = `max(earned − advances − confirmed payments, 0)` (Product 04 J5, D6);
- excess advanced/paid = `max(advances + confirmed payments − earned, 0)`, a review condition only — never debt, credit, remuneration, salary or receivable (Product D6);
- team earnings; salon part of purchases; reserve allocated and paid from reserve; *Livre* = produção − ganhos da equipa − despesas − compras (salão) − reserva alocada + pago pela reserva − excesso (Product D1, Slice 06); *Não distribuído* = livre − distribuição (D3);
- reserve balance = Σ allocations − Σ uses (D1);
- review conditions and readiness (pending rules, excess cases, unpaid approved amounts, distribution above free).

Rules:

1. **One implementation per formula**, in the owning module's calculation layer. Read models, previews and commands all call it.
2. **Previews use the same logic.** The rule screen's "Se confirmar X%" is a read-only database query that evaluates the same calculation with the hypothetical input, never a TypeScript copy.
3. **TypeScript holds no authoritative formula.** Allowed client-side: input checks for UX (mixed parts sum, contributions sum, the *Salão* remainder convenience), formatting with the organization's precision, the market-trip draft. Every such check is repeated by the command.
4. The cash-check candidate formula (Slice 06 C1) is **not approved** and is not implemented (Product 07 P5).

## 11. Period review revision / concurrency model

**Defined (ADR-0005).**

**Concept.** Each period has a **review revision**: a monotonically increasing value that identifies one state of everything the period's review can show or depend on.

**Invariant R-1.** Any successful command that changes data capable of altering the period's review or approval results changes that period's review revision **in the same transaction**. This includes, for records whose event date falls in the period:

- service records;
- advances;
- expenses;
- purchases (lines, totals, contributions);
- reserve allocations and uses;
- contextual rule decisions and changes;
- standing-rule versions that apply to the period;
- owners' decision;
- approval, annulment, payment confirmation, close, reopen;
- later corrections (when designed).

Changes that cannot alter results (e.g. a catalogue default price, a person's capability, a category label) do not change it.

**Invariant R-2.** A review read model returns its figures **and** the revision they were computed at from one consistent snapshot (one statement or one transaction), so a figure is never paired with a different revision.

**Invariant R-3.** A command whose meaning depends on what the user reviewed — at minimum **approve**, **annul** and **close** — submits the revision it was shown. Under the period lock it compares that value with the current revision; if they differ it commits nothing and returns `STALE_REVIEW`. The UI re-fetches and the user reviews again.

**Invariant R-4.** All commands that change a period's revision or state serialize on that period (row lock or equivalent), so compare-and-commit is atomic. The salon's volume makes this contention negligible; it is measured, not assumed (§22).

**Not decided here (Open product):** whether a record or correction may enter a period after approval, and what happens then (07 I1, P11). Either answer — rejecting such writes, or accepting them and surfacing a difference against the persisted approval outputs (§14) — fits the module boundaries and the revision invariants, but may require additive schema, command or constraint changes that are not pre-designed here (§21.1).

## 12. Idempotency model

**Defined (ADR-0006).** `command_id` is a separate concept from any entity id.

- **Every mutating command carries a client-generated `command_id`**, created once per user intent and reused, unchanged, for every retry of that intent. A new intent (e.g. *Registar outro*) gets a new `command_id`.
- **Command journal.** The first successful execution records, in the same transaction as the command's effects: `command_id`, command type, organization, principal, a **fingerprint of the semantic payload** (canonical form, excluding transport noise), the outcome reference/result, and time.
- **Replay** of a `command_id` with the same command type, principal, organization and fingerprint returns the **original result** without re-executing.
- **Reuse** of a `command_id` with a different type, principal, organization or fingerprint is rejected with `IDEMPOTENCY_CONFLICT`.
- **Concurrent duplicates** (the same `command_id` in flight twice) resolve through the journal's uniqueness: one commits; the other then observes the recorded outcome and returns it.
- **Ambiguous network result** (committed, response lost): the client retries with the same `command_id` (Product D5: data preserved, retry) and receives the original result. This is the reason the journal is written atomically with the effects.
- **Rejected commands are not journaled** (their transaction rolls back), so a retry re-evaluates against current state. The UI does not blind-retry domain rejections (§17).
- **Replay does not bypass authorization:** a replay is answered only to the same principal and organization, and returns only what the original response contained.
- Journal retention and whether it doubles as provenance are **Deferred**; it is not the business history (§14).

## 13. State machines

**Defined:** explicit, persisted state models with transitions only through commands; no scattered booleans (`is_approved`, `is_closed`, …).

| Machine | States and transitions | Status |
|---|---|---|
| **Period** | Aberto → Pronto para pagamento (approve) → Em pagamento (first confirmed payment) → Fechado (close) | States, "payments may exist before Fechado", "cannot close while approved amounts are unpaid", "closed not casually editable; reopening traced": **Product** (03 §2, 04 J5). |
| | Annul approval: Pronto para pagamento → Aberto | Designed in Slice 06 (only before any payment); canonical adoption **Open product** (07 I4). The state model allows the transition; its guard follows the product decision and may need additive command or constraint changes (§21.1). |
| | Reopen: Fechado → target | Reopen with mandatory reason and trace: **Product**. Target state **Open product** (07 I3). |
| | Every transition | Persisted with actor, time, reason (where required) and the revision; changes the review revision (§11). |
| **Approval** | active → annulled | Immutable record + annulment record. |
| **Person in period** | pending (contextual rule undecided) → determined (rule decided/changed while allowed) → frozen (approved) | Derived from rule versions, decisions and approval. |
| **Payment status per person** | por pagar → parcial → pago · nada a pagar | Derived. *Parcial* and over-payment behaviour **Open product** (07 I2); the data model allows several payments. |
| **Verification (elevation)** | none → granted (scope, expiry) → used / expired / revoked | **Defined** — ADR-0009. |
| **Device binding** | enrolled → revoked | **Defined** — ADR-0009. |
| **Stock product** | OK · Baixo · Comprar — human-set only; list membership independent | **Product** (Slice 05). |
| **Command attempt** (client) | editing → submitting → succeeded · rejected (domain) · failed (network; data kept, retry with same `command_id`) | **Product** D5 + §12. |
| **Market trip** (client draft) | planned → in progress → handed to purchase capture | **Defined:** client-local draft, not a business record (§15). |

## 14. Historical financial stability / audit model

**Defined (ADR-0007).** Immutable inputs are necessary but not sufficient: calculation code can change. A closed period must not silently change meaning.

| Category | Treatment |
|---|---|
| **Source records** (services, advances, expenses, purchases, reserve movements, rule versions and decisions, owners' decision, payments, transitions, reopen reasons) | Immutable, append-only, retained. |
| **Approved decision outputs** | At approval, persist per person the figures approved (production, rule used, earned, advances counted, payments, remaining payable, excess) and the period totals shown at approval, with the **calculation version** and the **review revision** approved. Immutable. |
| **Close statement** | At close, persist the period's close-time financial output — the figures of the close boundary and the closed summary (per-person lines and period totals including *Livre*, distribution, *Não distribuído*, reserve terms) — with calculation version and revision. A reopen does not alter it; a later close produces a new statement. The **closed period displays its latest close statement.** |
| **Calculation version** | An explicit identifier of the calculation semantics, changed whenever a formula's meaning changes, stored with approval outputs and close statements. |
| **Live derivation** | Open periods, Hoje, Stock read models, current reserve balance, readiness/exceptions of open periods, person situation of open periods. |
| **Divergence** | Recomputing a closed period may be used to *detect* a difference from its close statement (integrity check); a difference is surfaced for review, never written over the statement. |

This is not an accounting ledger, double entry or event sourcing: inputs stay normal records, and only two kinds of output (approval outputs, close statements) are persisted. 07 §10.2 records the same three categories: reconstructable source records, approval outputs required by the product, and close-time outputs kept only for historical meaning.

**Three separate histories (Defined):**

| History | Contains | Purpose |
|---|---|---|
| **Business history** | The domain records themselves, with attribution (verified actor or device + declared operator), times, reasons; approval outputs; close statements; the decision history view (Slice 06 F15); person history (Slice 04) | Explains every financial and decision outcome to the product's users |
| **Security audit** | Verification granted/denied/locked out; device bound/revoked; grant changes; configuration changes to rules, prices and settings; reopen | Security review; readable only with a security grant |
| **Technical logs** | Platform logs, client errors, performance | Operations; **never** the business record; must not contain financial amounts, notes or personal financial data |

## 15. Frontend architecture

**Defined (ADR-0008):** Vite · React · TypeScript · React Router · TanStack Query · generated Supabase database types. No global state library and no form framework initially; add one only when a demonstrated need appears.

- **Routing/layout:** app shell with the product spaces (Hoje, Serviços, Equipa, Dinheiro, Stock, Fecho, Definições — tab arrangement per Slice 01, **Open product** P18); full-screen capture flows over Hoje; private areas behind a private-context gate (UX only; RLS enforces).
- **Data access:** each module exposes a deliberate access layer of typed queries and commands. **Components never call `supabase.from(...)` (or RPC) directly.** Commands always send a `command_id` (§12) and, where required, the reviewed revision (§11).
- **State:** server state in the query cache; flow state local to the flow; a small app context for organization, principal and private-context status.
- **Private context on the shared device:** sensitive queries run only while the verified context is active; when it ends (explicit exit, expiry, revocation) all sensitive query caches are **removed**, not just hidden. This is defence in depth; RLS is the boundary.
- **Calculations:** none authoritative (§10).
- **Market-trip draft (Slice 05):** held on the device as a draft, never synced as a record; becomes a business record only through *Registar compra*. Fits D5 (no offline sync engine) and the market's uncertain connectivity. Whether to persist it across reloads is an implementation detail.
- **Errors:** network failure → keep entered data, offer retry with the same `command_id` (D5); domain rejection → show the stable error's message; no blind retry.
- **Not used in V1:** PWA/offline sync (D5), i18n framework (**Deferred**, 07 X2), notifications (**Deferred**).

## 16. Backend interaction boundaries

| Interaction | Path | Why |
|---|---|---|
| Operational reads (people, catalogue, products, Stock state, Hoje recents/counts) | Direct read under RLS | No mutation; RLS scopes it |
| Sensitive reads (situation, team finance, period review, position, reserve, decision history) | Views running with caller rights, or actor-checked query functions | Sensitive delivery rule (§3, §8) |
| Stock state, level, reserve units, plan/list/urgent | Direct write under RLS, with change history captured server-side | Low-risk human judgement; last write wins |
| Simple configuration lists (categories, origins, unit words, payment methods) | Direct write under RLS (B10), audited | Low risk |
| Standing rule versions, permission grants, catalogue prices | Database commands (B10), audited | Security- and money-relevant |
| All financial, production and period mutations (§9) | Database commands | One transaction, invariants, locks, revision, idempotency |
| Device enrollment (code redemption) and verification of a person's secret | Database commands (ADR-0009) | Atomic, audited, actor resolved server-side |
| Deleting a device's Auth user, person invitation/provisioning, organization provisioning | Edge Function or admin tooling (ADR-0009) | Needs the secret key / Admin API |

Edge Functions do not implement domain commands: they cannot hold one database transaction across several API calls, and commands must be atomic.

## 17. Error / transaction strategy

- **Transactions:** one command, one transaction (§9). Locks: the period row for revision/state changes; the organization's reserve for reserve use; uniqueness of `command_id` for duplicates.
- **Stable domain errors (minimum set):** `NOT_AUTHORIZED` · `VERIFICATION_REQUIRED` · `VERIFICATION_EXPIRED` · `CROSS_TENANT_REFERENCE` · `PERIOD_CLOSED` · `PERIOD_STATE_INVALID` · `STALE_REVIEW` · `RULE_PENDING` · `PAYMENT_EXCEEDS_APPROVED` · `UNPAID_APPROVED_AMOUNTS` · `RESERVE_INSUFFICIENT` · `CONTRIBUTIONS_MISMATCH` · `MIXED_PAYMENT_MISMATCH` · `IDEMPOTENCY_CONFLICT` · `VALIDATION_FAILED`. Codes map to the slices' error states; behaviour for open product cases (e.g. `PAYMENT_EXCEEDS_APPROVED` vs a partial payment) follows the product decision when taken (07 I2).
- **Network vs domain:** network/unknown outcome → retry with the same `command_id`; domain rejection → no automatic retry.
- **Stale state:** commands depending on reviewed numbers carry the revision (§11); after `STALE_REVIEW` the client re-fetches.
- **Partial-failure handling:** the market-trip draft is cleared only after the purchase command succeeds; a verification consumed by a failed command must not be reusable beyond its scope (spike); a payment retried from two devices resolves by `command_id` and state checks.

## 18. Testing architecture

Risk-first; the harness is built at implementation, not now.

| Layer | Covers |
|---|---|
| Database / RLS | A matrix of principal kind × verification × grant × organization against every table, view and query function: tenant isolation; shared device sees no sensitive class; self sees own rows only; expired/revoked verification denied; no direct DML on financial tables. |
| Command / invariant | Every command: authorization negatives (§9 S-13); invariants; state transitions valid/invalid; D6 formulas over rule × advance × payment combinations; reserve cap; contribution and mixed sums. **Golden datasets** from the approved examples: Slice 06 sample (*Livre* 60.000, A pagar 106.000, excess 6.000, no-excess world 66.000, 61.000 after Nádia's payment) and the D1 reserve example. |
| Concurrency / idempotency | Two sessions racing approve vs a new service (`STALE_REVIEW`); payment duplicates; reserve use races; `command_id` replay and conflict; committed-but-unacknowledged retry. |
| Historical stability | A changed calculation version does not alter a closed period's displayed close statement. |
| Frontend unit | Only where client logic exists: input checks, formatting, trip-draft reducer, error-code mapping. |
| Integration | Module access layers against a local Supabase with generated types. |
| End-to-end | A few phone-viewport journeys: record a service with nothing sensitive visible; advance through confirmation; private context ends and caches are gone; close happy path; network failure then retry without duplicates. |

## 19. Repository organization

Not created in this task.

```text
beauty-os/
  docs/                 product canon, design slices, architecture/ (this document, adr/)
  src/
    app/                bootstrap, router, shell, providers, organization/principal/private-context
    spaces/             route composition per product space (hoje, servicos, equipa, dinheiro, stock, fecho, definicoes)
    modules/            org, catalogue, services, team, purchasing, money, stock, period
                        each: access layer (queries, commands), types, UI and flows
    shared/             UI primitives, money/format, errors, API client, query setup
  supabase/
    migrations/         ordered schema, RLS, functions
    functions/          Edge Functions (only §16 cases)
    tests/              RLS, command, concurrency, idempotency, historical-stability tests
    seed/               development organization; golden datasets
  e2e/                  critical journeys
```

One package; no monorepo tooling. Module boundaries are a convention first; a lint rule is added when first violated (**Deferred**).

## 20. Delivery / vertical-slice strategy

1. **Checkpoint review** of this document and the ADRs.
2. **Device/elevation spike** (§23) → **done**: ADR-0009 accepted (Alternative A). Physical iOS Safari validation deferred until hardware is available; required before pilot sign-off.
3. **Minimal foundation**, only what the first slice needs: scaffold; local Supabase and migration pipeline; CI with type-check and database tests; preview deploy; organization, people, principals and actor context; RLS helpers; command scaffolding (journal, revision, error codes); seed loader.
4. **Slice 01 (record service on the shared device):** validates tenancy, the device principal, operational reads, the first command with `command_id`, revision bump, Hoje composition, D5 retry.
5. **Slices 02 + 04:** validates verification, sensitive classes, SQL derivations, self vs manager views.
6. **Slice 03, then Slice 05** (Stock depends on purchasing).
7. **Slice 06** in cuts: rules + position (read) + reserve (D1; UI designed in this slice); approval + payments; close, reopen, close statements, decision history.
8. **Before the pilot:** minimal configuration screens, Equipa and Dinheiro lists, corrections (product design required first, 07 I1).

No horizontal infrastructure phase beyond step 3.

## 21. Explicitly deferred decisions

### 21.1 Architectural position on open product questions

- The open product questions listed below (and in 07 §5.2–§5.3) **do not block** this Architecture Definition or the device/verification spike.
- Their eventual answers **may require additive schema, command, state-transition or constraint changes.**
- They **should not invalidate** the system context, trust boundaries or module boundaries defined here.
- Those future changes are **not pre-designed** in this document.

### 21.2 Deferred decisions

| Decision | Until |
|---|---|
| Verification secret format, lockout thresholds and timeout values; idle-timeout extension | Implementation; UX details also need product input (05 §3) — mechanism decided in ADR-0009 |
| Physical iOS Safari validation of ADR-0009 | Hardware availability; required gate before pilot / production-readiness sign-off |
| Correction mechanics and records entering a period after approval | **Open product** (07 I1, P11) |
| Partial payments / over-payments behaviour beyond the canon | **Open product** (07 I2) |
| Reopen target state | **Open product** (07 I3) |
| Approval granularity; annulment guard | **Open product** (07 I4) |
| Closing without an owners' decision | **Open product** (07 I5) |
| Notifications | Product need |
| i18n implementation | Post-V1 (07 X2) |
| Error-reporting vendor | Before pilot |
| Materialized views / cached read models | Performance evidence |
| Command-journal retention | Implementation |
| Dedicated definer-owner role with forced RLS | Implementation (§9 S-7) |
| Module-boundary lint tooling | First violation |
| Remote-person sign-in method (email, magic link, phone OTP) | Deferred (ADR-0009); before remote payment confirmation is implemented |
| PWA / offline sync | After pilot evidence (D5) |

## 22. Architecture risks

| Risk | Mitigation |
|---|---|
| The chosen device/verification mechanism cannot meet the requirements in hosted Supabase | Bounded spike with rejection criteria before any feature work (§23) |
| SECURITY DEFINER misuse (missing tenant checks, mutable `search_path`, over-broad EXECUTE) | Contract S-1…S-13; negative tests for every command; review checklist |
| Sensitive data left in the shared browser (cache, history, back navigation) | Cache removal on context end; verification expiry; RLS as the boundary |
| Brute force of a short verification secret | Server-side verification with rate limiting and lockout (spike) |
| SQL-centred logic harder to test and evolve | Golden datasets; command tests; calculation version (§14) |
| Period-row serialization becomes contention | Measure; salon volumes are small; revisit only with evidence |
| RLS overhead | Actor context evaluated once per statement; organization-scoped indexes; measure |
| Calculation changes alter closed periods | Close statements + calculation version (§14) |
| Undecided product cases leak into implementation as accidental behaviour | Explicit **Open product** markers; commands for those cases are not built until decided |
| Market connectivity breaks shopping | Client-local trip draft; only *Registar compra* needs the network |

## 23. Device / elevation spike specification

**Status: completed** (2026-10-06). Outcome in §23.6 and ADR-0009 (Accepted).

### 23.1 Requirements and invariants the mechanism must satisfy

| # | Requirement |
|---|---|
| E-1 | A shared device acts for **exactly one organization**; its binding is created by an authorized person and **revocable server-side**, with revocation effective within a bounded, stated time. |
| E-2 | **Ordinary capture needs no per-action login**; switching the declared operator is instant (05 §3). |
| E-3 | A **sensitive action identifies an individual person verified server-side**; the database records the verified actor; the client cannot assert or spoof it. |
| E-4 | A **private context** grants sensitive reads only while active; it **expires on idle and on explicit exit**, is revocable, and is **not inherited by the next holder** of the device. |
| E-5 | **One-action** and **private-session** scopes are distinguishable, and the database can tell which applies to a request. |
| E-6 | **Secret verification is server-side** with hashing, **rate limiting and lockout**; the secret is never verified or stored in the browser. |
| E-7 | **No service-role credential or signing secret in the browser.** |
| E-8 | **RLS and command functions can resolve the actor context** (organization, principal kind, device, verified actor, scope, expiry) from the request **once per statement**, without per-row lookups. |
| E-9 | A **person principal on a personal device** fits the same actor model (B6 remote payments; 05 §2). |
| E-10 | Compatible with **`command_id` replay** (§12): a replay is answered to the same principal only and does not widen authorization. |
| E-11 | Every verification **grant, denial and lockout** and every binding change is recorded in the **security audit**. |
| E-12 | Works on the shared phone's mobile browser with sessions surviving reloads and normal token refresh. |
| E-13 | Uses **documented, supported** Supabase capabilities only. |

### 23.2 Viable alternatives to evaluate

| Option | Device principal | Verification / private context |
|---|---|---|
| **A** | Anonymous Supabase user per device, bound to an organization by redeeming a one-time enrollment code (server-side) | Server-side verification writes a short-lived **grant** bound to that device session; RLS/commands read it |
| **B** | Provisioned device account (a regular Supabase user per device) created by an authorized person | Same grant mechanism as A |
| **C** | Device session as in A or B | The person signs in on the device as **their own person principal** (separate session) for the sensitive action or private context, then the device session resumes |
| **D** | Device session as in A or B | A server-side function issues a **short-lived token** carrying the verified actor and scope, accepted by the database for sensitive calls |
| **E** (baseline, expected to fail) | Any | Client-side PIN only, with no server verification — included to make the rejection criteria concrete |

Combinations (e.g. B + C) are allowed if they satisfy every requirement.

### 23.3 Questions the spike must answer

| # | Question |
|---|---|
| SQ-1 | Can RLS and definer functions identify the **specific session** of a request and evaluate an active grant or token claim reliably and once per statement? Measured overhead on a representative query? |
| SQ-2 | Anonymous users (A): how long do sessions persist; refresh behaviour; platform cleanup and rate limits; can a binding be revoked so the device loses access within the stated bound? |
| SQ-3 | Provisioned device accounts (B): provisioning and credential hand-off without exposing secrets; revocation of all sessions; recovery when the phone is replaced. |
| SQ-4 | Separate person session on the device (C): can two sessions coexist safely in one browser; how reliably is the device session restored; does anything sensitive survive in storage or history after exit? |
| SQ-5 | Short-lived tokens (D): can they be issued and accepted using supported Supabase features (current signing-key model) without exposing signing material? How is revocation before expiry handled? |
| SQ-6 | Verification secret: with server-side rate limiting and lockout, is a short numeric secret acceptable? Where are attempt counters kept; what are the lockout and unlock paths? |
| SQ-7 | Expiry and revocation latency: how quickly does an ended private context stop returning sensitive rows (token lifetime vs grant check)? |
| SQ-8 | How does a server-side function securely identify the calling device session when issuing a grant or token? Latency on a mobile network? |
| SQ-9 | Behaviour with D5 failures: verification succeeds, the command's response is lost, the client retries with the same `command_id` after the verification expired — correct outcome? |
| SQ-10 | How are one-action and private-session scopes represented and enforced, and how is a one-action verification prevented from being reused? |
| SQ-11 | Person principal sign-in on a personal device: which method (email/password, magic link, phone OTP) is reliable for the pilot, and what external dependency does it add? |

### 23.4 Acceptance and rejection criteria

A mechanism is **accepted** only if, in a throwaway Supabase project:

1. An automated test matrix passes:
   - an unbound principal reads nothing;
   - a bound device reads operational-shared data only;
   - every sensitive view/function returns **no rows** without verification;
   - with verification it returns the authorized rows;
   - after expiry, and after revocation, it returns no rows within the stated bound;
   - a verification from device X is unusable from device Y;
   - cross-organization access is denied in every case.
2. A command records the **server-verified actor**; attempts to supply or alter the actor from the client fail.
3. Repeated wrong secrets trigger **lockout** as specified; the attempts are in the security audit.
4. The production build contains **no service-role key or signing secret** (checked mechanically).
5. Actor-context resolution adds a **measured, reported** overhead and is evaluated once per statement, not per row.
6. Sessions survive reloads on current mobile Chrome (Android) and Safari (iOS); a private context is gone after timeout and after explicit exit, including back navigation.
7. Only documented Supabase features are used.

A mechanism is **rejected** if any requirement in §23.1 is unmet without a documented, acceptable mitigation; if it relies on undocumented behaviour; if revocation or expiry cannot be bounded; or if it needs privileged credentials in the browser.

### 23.5 Deliverables and limits

- A short spike report: options tried, test-matrix results, measurements, recommendation, residual risks.
- ADR-0009 moved to *Accepted* (or revised) at its own checkpoint.
- Spike code is throwaway and is not merged into `main`.
- Time-boxed; out of scope: product UX of the verification step, final schema, any feature code.

### 23.6 Outcome (2026-10-06)

- **Chosen:** Alternative A — anonymous device principal, server-side device binding, database-held verification grants, trusted actor context — with the mandatory mitigations in ADR-0009. **B** is the documented fallback; **C**, **D**, **E** are rejected for the shared device (reasons in ADR-0009).
- **Evidence:** automated access matrix, timed revocation/expiry/idempotency/brute-force tests, Chromium persistence tests and an Edge Function admin boundary on a disposable local stack; physical **Android Chrome PASSED**, corroborated by server-side records.
- **Physical iOS Safari: DEFERRED UNTIL HARDWARE IS AVAILABLE.** Required gate before pilot / production-readiness sign-off; it does not block ADR-0009 or the start of implementation; emulated or desktop engines are not a substitute.
- Acceptance criterion 6 of §23.4 is therefore met for Android Chrome and open for iOS Safari.

## 24. Architecture Definition readiness checklist

| Item | State |
|---|---|
| Constraints recorded (stack, hosting, monolith, RLS boundary, tenancy) | Done (§2, §3, ADR-0001/0002/0008) |
| Module ownership and dependency rules | Done (§4, §5) |
| Data principles traceable to the product canon | Done (§6) |
| Identity concepts and attribution levels | Done (§7); mechanism in ADR-0009 |
| Authorization classes and RLS rules | Done (§8) |
| Trusted command contract (definer security) | Done (§9, ADR-0003) |
| Calculation authority and preview rule | Done (§10, ADR-0004) |
| Review revision invariants | Done (§11, ADR-0005) |
| `command_id` idempotency semantics | Done (§12, ADR-0006) |
| State machines limited to decided product behaviour | Done (§13) |
| Historical stability and three histories | Done (§14, ADR-0007) |
| Frontend structure and private-context cache rule | Done (§15, ADR-0008) |
| Backend interaction boundaries | Done (§16) |
| Error codes and transaction strategy | Done (§17) |
| Testing layers and golden datasets | Defined (§18); harness at implementation |
| Repository organization | Defined (§19); not created |
| Delivery sequence | Defined (§20) |
| Deferred and open-product items listed | Done (§21) |
| Spike specification with acceptance criteria | Done (§23) |
| Checkpoint review of this document | **Done** — approved 2026-10-06 |
| Device/elevation mechanism | **Done** — ADR-0009 Accepted; iOS Safari physical validation deferred (pre-pilot gate) |
