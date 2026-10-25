# ADR-0010 — Offline capture and foreground synchronization (Offline V1)

**Status:** Accepted (Sollelio, 2026-10-15 — Offline 0) · **Amended** §5 (Sollelio, 2026-10-25: device purpose — implemented; operational week end — implemented)
**Supersedes:** [07 §2 D5](../../07_PRE_IMPLEMENTATION_GAP_CLOSURE.md#d5--connectivity-a1-saving-requires-a-network-connection) (connectivity: online-required, no offline engine) — **in part**: online-required saving still applies to everything outside the offline scope below.
**Related:** [Architecture Definition §12, §13, §15](../architecture-definition.md) · [ADR-0003](0003-trusted-database-commands.md) · [ADR-0005](0005-period-lifecycle-and-review-revision.md) · [ADR-0006](0006-command-idempotency.md) · [ADR-0007](0007-historical-financial-stability.md) · [ADR-0009](0009-shared-device-principal-and-verification.md) · 05 §2

## Context

D5 (2026-10-06) made V1 online-required: saving needs a connection; a failed save keeps the data and retries the same `command_id`; no offline queue, local persistence or sync engine. That was right for the pilot-readiness phase, when the product had no installable shell and connectivity evidence was missing.

Since then Beauty OS has become mobile-first and installable as a PWA (05 §2), and operational evidence shows that a temporary loss of connectivity (internet or electricity at the salon) can stop salon work. Offline support therefore enters the product **deliberately and narrowly**, under the constrained architecture below. Postgres stays authoritative; offline is not an alternate backend.

Findings this decision rests on (code, 2026-10-15):

- `record_service` needs only the device principal (device + declared operator); its payload is fully client-supplied (the value charged, payment parts).
- `record_advance`, `record_expense`, `record_purchase` each consume a **one-shot `movement.confirm` grant** (server PIN verification, bound to the device's Auth session, 120 s) — they cannot complete offline without weakening ADR-0009.
- All four capture commands set `occurred_at` from the server clock today; the period is derived from `occurred_at` by the `touch_period_of_event` trigger (refusing approved / closed periods).
- Capture commands are idempotent through the command journal (ADR-0006), keyed to the device principal (`auth.uid()`).
- Stock state and list edits are direct, last-write-wins table updates without a `command_id`.

## Decision

### 1. Offline V1 capability (closed list)

| Class | Flows |
|---|---|
| **Full offline** — completed locally, queued, synchronized later | **Registar serviço** only |
| **Offline draft** — kept on the device; becomes a record only after the online PIN/grant confirmation | **Adiantamento · Despesa · Compra** |
| **Local operational draft** — never a record | **Mercado trip**, from an approved cached snapshot |
| **Read-only cached** — previously synced data, dated | **Hoje · Stock overview** |
| **Online only** | Private entry · Equipa · Situação · Fecho and every Fecho flow · RuleFlow · Dinheiro · Reserva · Posição · Pagamentos · Negócio · Gestão · Anular · Rever stock · Stock state edits · Lista edits · enrollment · PIN verification |

This list is not broadened during implementation without a later architecture decision.

**Pilot-scope amendment (Sollelio, 2026-10-15, Offline 8).** After the implementation and hardening review, three rows above are **deferred from the Offline V1 pilot scope** and remain possible Offline V2 candidates: the **read-only cached Hoje** (offline, Hoje shows its offline note and the local counts, never server figures as zero), the **read-only cached Stock overview** (offline, Stock / Lista / Mercado show their load error under *Sem ligação*), and **starting a Mercado trip offline**. Compra offline is unchanged: it is the Offline 6 draft, confirmed online with the PIN. **Known limitation:** `navigator.onLine` is only a browser signal — with Wi-Fi connected but the backend unreachable, an online save fails with a retryable network error and is **never** turned into a new offline intent (its outcome is uncertain; a second intent could duplicate it); the recovery is the genuine offline path (no connection, or the cached binding after a relaunch without reaching the server). Server-reachability / failover detection is deferred.

### 2. Capture time

For the four operational capture commands (`record_service`, `record_advance`, `record_expense`, `record_purchase`):

- **`occurred_at`** = the business-event time captured on the device; **`recorded_at`** = the server write time, authoritative for audit.
- The commands accept an optional **`p_occurred_at`**, which **participates in the command fingerprint**.
- Bounds, checked by the server against its own clock: **at most 48 hours old; at most 5 minutes in the future.** Outside them the command is **rejected** — the server never substitutes its own time — and the item is surfaced for review.
- The period rules apply to `occurred_at`: a record whose period is approved or closed is **rejected**, never moved to another period.
- Normal online UX does not expose arbitrary historical date selection; the facility exists for delayed synchronization and offline drafts.

### 3. Offline movements

Adiantamento, Despesa and Compra are **not financial records while offline**: they are device-local drafts. They become records only after reconnecting and completing the existing online `movement.confirm` PIN/grant flow (ADR-0009). **No offline PIN verification, no cached PIN hashes, no offline grants.** The record keeps the draft's captured `occurred_at` and gets the real server `recorded_at`; the **confirming person is whoever performs the online PIN confirmation**.

### 4. Security boundary

Only public operational functionality gains offline behaviour. Private mode and sensitive financial / administrative functionality stay online-only. **Never persisted locally:** PINs or PIN-derived material; grant ids; private-session state; professional remuneration or private finance; Fecho state; Negócio / business-health responses; reserve, position or payment private data.

Browser-storage encryption is **not** treated as protection against compromise of the same device, unless a future architecture introduces defensible external key management.

### 5. Multi-device period sync safety (server-side block)

**Invariant:** *A period cannot be approved or closed until the server knows that every active offline-capable device is synchronized for that period.*

Contract (the implementation is designed in Offline 7):

- A device enters the **required set** when the server registers it as **offline-capable** (a check-in declaring the capability). **Offline capture is enabled on a device only after that registration**, so no unregistered device can hold offline work.
- A device is **period-sync-safe** for a period only after a **check-in received after the period's end** (organization timezone) reporting, for that period: **zero queued commands, zero unconfirmed offline drafts, zero unresolved conflicts.** The latest check-in is the one that counts.
- `approve_period` and `close_period` **fail** while any device in the required set has pending work, an unresolved conflict, no check-in after the period end, or an unknown sync state.
- A **formally revoked / unbound** device leaves the required set. A device whose storage was lost (re-enrolled under a new binding) blocks until its old binding is formally revoked.
- **No manager override** in Offline V1.
- Late arrivals stay protected independently: the server already rejects records into approved or closed periods.

**Amendment (Sollelio, 2026-10-25).** Approved together; implemented in slices.

- **Device purpose — implemented (Slice 1).** A bound device is **operational** (the default: every existing device and every enrollment) or **support** (Sollelio support, diagnosis and administration inside one organization). The required set is every active, offline-capable **operational** device. A support device stays bound and keeps its online capabilities (it is not revoked), and it **cannot hold offline work**, enforced by the server: its captures always take the server's time — any capture carrying a device-captured time (a queued offline service, a movement draft confirmed later) is refused (`DEVICE_ONLINE_ONLY`) after the journal replay (ADR-0006 unchanged) and before any grant is consumed; its check-ins are answered and ignored, so it never becomes offline-capable. The client keeps no new offline work on it (the purpose comes with the device context and is kept in the cached binding for an offline start), and sends no check-in. The purpose changes only through an audited operator procedure; a device becomes support only when its last check-in held no work, and becomes operational again through its next check-in (the normal, audited registration). **Invariant:** *no device outside the required set can hold offline work.*
- **Operational week end — implemented (Slice 2).** A period becomes period-sync-eligible at its **operational end**: the end of the week declared explicitly by a `period.decide` holder (one-shot verification, exactly-once) on the period's last operating day in the organization's timezone, or its calendar end when no declaration is active. The organization's schedule — its last operating weekday and usual closing time — is organization data, set by an audited operator procedure; an organization without it, and every period without a declaration, behaves exactly as before. Before the usual closing time the app asks for an explicit confirmation and the server records the declaration as early; nothing ever ends by clock time. Declarations and withdrawals are append-only records (who, when, early); the latest one decides. **Input freeze:** while a declaration is active, a service, advance, expense or purchase of the period whose **occurrence time** (`occurred_at`: when the activity happened, not when it reaches the server) is **after the declared end** is rejected (`PERIOD_WEEK_ENDED`), never moved to another period; work that happened at or before the end and syncs afterwards (offline, or a draft confirmed later) is still accepted — otherwise a phone holding it could never become ready. An online capture has no device time: its occurrence time is the server's time, so after the declaration it is rejected. Before approval a `period.decide` holder can withdraw the declaration (the period accepts records again; the week can be ended again); after approval the existing annulment rules apply. The check-in rule above reads "received after the period's operational end".
- Unchanged: exactly-once (ADR-0006), foreground-only sync, RLS and grants, `PERIOD_OFFLINE_SYNC_PENDING`, and **no override**.

### 6. Local storage model

| Store | Holds |
|---|---|
| **IndexedDB** | outbox (queued commands), movement drafts, capture snapshot, offline metadata |
| **localStorage** | small UI flags; the existing Mercado trip may stay there for now |
| **Cache Storage** | the static app shell only, through the service worker |

Supabase, API and RPC responses are **never runtime-cached**. Every persistent operational row is **partitioned by organization and device principal**. A mismatch, an organization change, an unbind or a re-enrollment triggers **quarantine**: items of another binding are never shown in content or synchronized under the new one; their existence is shown as a count only, and they are discarded only by explicit human action.

### 7. Service worker

A minimal service worker is introduced (Offline 5) only so the installed app shell starts without connectivity. It may precache the HTML shell, the built JS/CSS and icons/static assets. It **must not** runtime-cache Supabase, APIs, RPC responses, private data or business records. **No Background Sync API in V1.**

### 8. Storage persistence

The implementation may request `navigator.storage.persist()`. Persistence is not guaranteed; the architecture **must not depend on it being granted**; eviction and loss are covered in hardening (Offline 8). Device storage is never treated as durable like the server.

### 9. Synchronization (Registar serviço)

- The `command_id` is generated **once, at local capture**; the complete approved payload plus `occurredAt` is persisted; the **same command is replayed** until acknowledged; the command journal provides idempotency (ADR-0006).
- **States:** `local → syncing → synced`, plus **`failed`** (transient, retryable automatically with backoff) and **`conflict`** (a domain or security rejection requiring human review; never retried blindly).
- **Foreground drain only:** app start, connectivity return, gentle retry while the app is open, and an explicit **"Enviar agora"**. One command at a time, oldest first; stop on authentication or network failure; continue past per-item conflicts.
- Before draining, the device session is refreshed. A changed session or principal is **never blindly replayed as a new principal**: items possibly committed under the previous principal go to review.

### 10. Conflicts (never silently merged or substituted)

| Situation | Rule |
|---|---|
| Catalogue price changed while offline | Keep the captured value (historical semantics, ADR-0007). |
| Referenced service, person or payment method deactivated | Conflict requiring review (distinct rejection codes — Offline 1). |
| Period approved or closed | Conflict; never moved to another period. |
| Capture time outside the bounds | Conflict requiring review. |
| Device revoked | Stop synchronization; say the device is no longer linked to the salon; keep the items readable for re-entry elsewhere. |
| Session / principal changed | No blind replay as a new principal; review. |
| Discarding a conflict | Explicit human action only; never automatic. |

### 11. UX contract

Offline is always visible and calm. Global: **"Sem ligação"**. Offline service success: **"Guardado neste telemóvel · será enviado quando houver ligação"**. Movement draft: **"Guardado neste telemóvel · por confirmar com PIN"**. Hoje: stale server data shows its last-updated time; the local pending count stays **separate** from server totals. A small sync / review surface, not a dashboard. **An unsynced record is never labelled "Registado".**

### 12. Implementation order

| Slice | Scope |
|---|---|
| Offline 0 | This ADR and the contracts |
| Offline 1 | Backend capture-time readiness (`p_occurred_at`, bounds, fingerprint) and distinct rejection codes |
| Offline 2 | IndexedDB persistence foundation (partitioning, quarantine) |
| Offline 3 | Connectivity and foreground sync status |
| Offline 4 | Registar serviço offline |
| Offline 5 | Static-shell service worker |
| Offline 6 | Movement drafts |
| Offline 7 | Conflicts / recovery and the multi-device Fecho guard |
| Offline 8 | Hardening and pilot validation (including physical iOS Safari) |

**Offline 1 must be completed and verified before any local command queuing is implemented.**

## Consequences

- One additive backend change to the capture commands (Offline 1) and one server-side period-safety mechanism (Offline 7); no change to the private, Fecho, Negócio or Gestão commands.
- ADR-0006 idempotency is relied on for delayed replay; the journal's principal binding means a re-enrolled device cannot replay a previous principal's command.
- ADR-0009 is unchanged: no verification happens offline; movements wait for the online grant.
- Approval and close can be blocked by a silent device: an abandoned binding must be formally revoked (operations procedure).
- Device storage can be lost; work captured offline and lost before synchronization cannot be recovered by the server.

## Rejected alternatives

- **Offline PIN verification with cached hashes or pre-issued grants** — exposes verification material on a shared device, defeats server lockout and revocation (ADR-0009).
- **Server-time substitution for late records** — would place records in the wrong period silently.
- **Moving rejected records to the next open period** — silent re-attribution of financial records.
- **Manager override of the period sync block** — the invariant would depend on judgement about devices the server cannot see.
- **Runtime caching of API / RPC responses** — persists protected data and stale truth.
- **Background Sync API** — not available on all target browsers; foreground sync is sufficient for V1.
- **Offline Stock edits** — last-write-wins updates without a `command_id` would overwrite other devices silently (deferred to a later decision).

## Deferred

- Offline Stock state and list edits (would need a command with a base version).
- Fully offline movements (would need a defensible offline verification model).
- Background Sync.
- Moving the Mercado trip from localStorage to IndexedDB.
- Read-only cached Hoje and Stock overview; starting a Mercado trip offline (pilot-scope amendment, Offline 8).
- Server-reachability / failover detection beyond `navigator.onLine` (Offline 8).
- The check-in transport, cadence and storage of device sync state (Offline 7 design).
