# ADR-0011 — Android package of the web app with Capacitor

**Status:** Accepted (Sollelio, 2026-10-19 — Android feasibility checkpoint A1–A3) as the **Android implementation direction**. **A Google Play production release is not approved.**
**Amends:** [ADR-0008](0008-frontend-stack-and-repository-organization.md) **in part** — the same application is also delivered as an Android package; the web/PWA on Netlify continues unchanged.
**Related:** [Architecture Definition §15](../architecture-definition.md#15-frontend-architecture) · [ADR-0009](0009-shared-device-principal-and-verification.md) · [ADR-0010](0010-offline-capture-and-sync.md) · [00 §1](../../00_PRODUCT_CONTEXT.md#1-company-and-product) · [05 §2](../../05_PRODUCT_EXPERIENCE_MODEL.md#2-device-constraints-and-form-factor) · [03 §4](../../03_V1_SCOPE.md#4-explicitly-not-v1--decided)

## Context

Beauty OS is one responsive, mobile-first web application (05 §2, `Decided`), hosted on Netlify and installable as a PWA (ADR-0010). Salon operation happens on Android phones. A bounded feasibility spike (Android A1–A3) evaluated packaging **the same application** for Android with Capacitor, without a second codebase and without changing the backend, the security model or Offline V1.

## Decision

- **The Android app is a Capacitor package of the existing React/Vite application:** same source, same UI, same Supabase backend, same Accepted ADRs (RLS, trusted commands, ADR-0009 device principal, ADR-0010 Offline V1). It is **not a separate native app**: no native UI, no React Native / Expo, no TWA. (Product decision recorded in 00 and 05 §2, Sollelio 2026-10-19.)
- **The web/PWA on Netlify continues unchanged**, including its static-shell service worker (ADR-0010 §7).
- **Bundled assets only:** the Android shell serves the built `dist/` from the device (`https://localhost`); never a remote `server.url`, never the Netlify site. The static-shell service worker is **not registered** in the Android shell (`registerServiceWorker`, runtime check), since the bundled assets already open without a connection.
- **Native surface kept minimal:** Capacitor core only, no extra plugins; permissions `INTERNET` and `ACCESS_NETWORK_STATE`. The latter is required: without it Android WebView never reports offline (`navigator.onLine` stays `true`), which breaks ADR-0010's connectivity signal.
- **Build:** Capacitor 8 (`@capacitor/core`, `@capacitor/android`, `@capacitor/cli`, pinned), `android/` project in the repository, JDK 21 and the Android SDK.
- **Identities and environments (Android R2, Sollelio 2026-10-19):** one Gradle flavor per environment, defined once in `android/environments.json`:

  | Flavor | Application id | Launcher name | Supabase | CAPTCHA |
  |---|---|---|---|---|
  | `dev` | `com.sollelio.beautyos.dev` | Beauty OS Dev | Dev (`plukxnjnmowlnplpgsnm`), exclusively | optional |
  | `prod` | `com.sollelio.beautyos` | Beauty OS | Prod (`kzirzmtarnskwirufyjw`), including closed testing | required |

  Play listing title: *Sollelio Beauty OS*. The feasibility package `com.sollelio.beautyos.spike` stays an independent experimental installation (no migration).
- **Fail-closed environment separation:** `npm run android:sync:dev|prod` builds with `vite --mode android-dev|android-prod`, which reads env files only from `android/env/` (git-ignored `.env.android-<env>.local`, never the root `.env.local`) and is **refused** unless they point at that environment's Supabase project (and, for prod, carry the CAPTCHA site key); the bundle gets an environment marker; `cap sync`; `scripts/check-android-bundle.mjs <env>` re-checks the synced bundle (marker, only its project, no `server.url`, no secret key). Gradle refuses to package a flavor whose synced marker is not that flavor, or whose Capacitor config does not use the flavor's approved WebView hostname (a verification task wired through AGP's public variant API, so it runs before every variant's asset merge whatever its task names), so a Dev bundle never ships as prod, nor the reverse. The web/PWA build is unchanged (no marker, root env files).
- **Prod refused until its origin is approved:** `webViewHostname` in `android/environments.json` is `localhost` for dev and `null` for prod; while it is `null`, every prod Android build is refused (web build, bundle check and Gradle), so no usable prod artifact can carry the temporary `https://localhost` origin. The hostname fixes where the app's local data lives and must not change once a prod build is installed.
- **Not yet decided / configured:** signing and keystores, versioning, release brand assets, the WebView origin hostname, and any production-connected build (none has been made).
- **iOS:** not in scope of this decision.

## Evidence (2026-10-19)

One physical device: Google Pixel 4a (5G), Android 14, Android System WebView 156; Supabase Dev; organization «Teste Offline O».

| Step | Result |
|---|---|
| A1 · bootstrap | Debug APK built (Capacitor 8.5.3, JDK 21, Android Gradle Plugin 8.13, Gradle 8.14.3, compile/target SDK 36, min SDK 24). Web/PWA build, typecheck, lint and tests unchanged; bundle check: bundled assets, Dev only. |
| A2 · install and launch | Installed and launched; enrollment preserved across updates; no service worker registered; assets served from the device. |
| A2.1 · network state | Without `ACCESS_NETWORK_STATE`: `navigator.onLine` stayed `true` with every radio off, and an offline cold start looped between «A carregar…» and Hoje (155 `device_context` requests in about two minutes). With it: `onLine=false`, `connection.type=none`; offline cold start settles on Hoje with one request. |
| DeviceGate recovery | Refetch only on the offline → online transition; one background request when the app returns to the foreground on the cached binding. Reconnect recovered with one request; `visibilitychange` fires on Android for background and foreground. |
| A3 · offline flows | Registar serviço offline → synced once on reconnect. Adiantamento, Despesa and Compra saved as drafts offline, survived an offline restart, confirmed once online with the PIN; private area blocked offline. On Supabase Dev: exactly one record and one command-journal entry per command, fields matching the drafts, original capture times kept, no duplicates. |

## Consequences

- One codebase serves the web and Android; Android adds a native build step and the `android/` project.
- WebView behaviour (network state, visibility, storage) must be validated on devices; it differs from Chrome.
- Web changes reach Android only through a new build and install; there is no remote update path.

## Open before an Android release — `Open / requires validation`

- **Unitel Mais Smart 4G: not tested.** The compatibility risk is accepted for continuing development; this is **not evidence of compatibility**. Only one device and one WebView version were tested.
- **Google Play release: not approved.** Production application id, signing, release build, versioning, store listing and privacy declarations are not done.
- ~~**Shared-device privacy:** the generated manifest allows Android backup (`allowBackup="true"`), which may include WebView storage (IndexedDB); to be decided.~~ **Restricted (Android S1, 2026-10-19):** `allowBackup="false"`; `dataExtractionRules` (Android 12+) excludes every storage domain from cloud backup **and** device-to-device transfer; `fullBackupContent` (Android 11 and lower) excludes every domain too. The device session, offline outbox and drafts therefore never leave the phone through Android backup or transfer. Consequence: local data has no copy — if the app's storage is cleared, the app is uninstalled or the phone is lost, unsynchronized services and unconfirmed drafts are lost (the server stays authoritative for everything already synchronized). Builds installed before S1 may already be in the phone's backup queue; whether a copy was uploaded is not known.
- **Production configuration:** production Supabase and the CAPTCHA hostname for the `localhost` origin (ADR-0009 mitigation 4) are not configured for Android.
- **Known limits of the DeviceGate recovery:** a server that becomes reachable while the app stays in the foreground, with no connectivity change, is found only on the next return to the foreground (no polling); the offline → online refetch may briefly show «A carregar…».
- The physical PWA checklists in [offline-device-validation](../../operations/offline-device-validation.md) are not closed by these Android results; ADR-0009's iOS gate is unaffected.

## Rejected alternatives

- **React Native / Expo** — a second UI codebase; contradicts one application (05 §2).
- **Trusted Web Activity / remote `server.url`** — the app would load the hosted site instead of bundled assets, coupling Android to the website's availability and deployment.
