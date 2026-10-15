# Offline V1 — physical device validation (Offline 8)

Manual checklists for a person with the phone in hand. They complete what automated browser runs cannot prove:
installation, the home-screen app, real airplane mode, and the browser keeping the app and its storage across real
closes. Automated evidence (Chromium with mobile emulation against Dev) is recorded in
[architecture-definition §21.2](../architecture/architecture-definition.md#212-deferred-decisions); it is **not** a substitute.

**Status (2026-10-15):** Android physical — **OPEN** (not run). iOS Safari physical — **OPEN** (no device available);
a pilot gate if iPhones are in the pilot ([pilot-readiness](pilot-readiness.md)).

## Preparation (Dev, synthetic data only)

- A production-like build of the `dev` branch served over **HTTPS** (a Netlify deploy preview or branch deploy pointed
  at Beauty OS Dev). A service worker needs HTTPS outside `localhost`; never point a test phone at Prod for this.
- Synthetic salon: *Teste Offline O* (`TEST-ORG-O-2026`), confirmer *Gestor O*, PIN `919191`. For the Fecho steps:
  *Teste Offline Sync* (`TEST-ORG-SYNC-2026`), *Gestor Sync*, PIN `969696`, and a second phone or browser.
- The operator has the Dev SQL editor open (runbook §3 queries) for the revocation steps.
- Write down for each step: PASS / FAIL, the time, and a screenshot of any FAIL.

## A. Android (Chrome)

**Install / PWA**
1. Open the app in Chrome, enroll with `TEST-ORG-O-2026`. Hoje shows the salon.
2. Chrome menu → *Install app* (or *Add to Home screen*). The icon and the name *Beauty OS* appear on the home screen;
   the icon is the Beauty OS mark (not a letter tile).
3. Launch from the icon: it opens **standalone** (no address bar), status-bar colour dark (`#11152D`), background light.
4. Close it completely (recent apps → swipe away), wait 30 s, reopen from the icon: it opens on Hoje, still enrolled.

**Cold start offline**
5. With connection: open Registar serviço once (so the salon data on the phone is fresh), then close the app completely.
6. Turn on airplane mode (Wi-Fi and mobile data off). Launch from the icon.
7. Hoje loads; *Sem ligação* at the top; no server figures shown as zero.
8. Registar serviço opens with the people and services; save one service → *Guardado neste telemóvel · Será enviado
   quando houver ligação*. Hoje shows *1 registo por enviar*.
9. Close the app completely and reopen it, still offline: *1 registo por enviar* is still there.

**Movement drafts (still offline)**
10. Save an Adiantamento, a Despesa and a Compra. No PIN field appears; each says *Guardado neste telemóvel · Por
    confirmar com PIN quando houver ligação*. Hoje shows *3 por confirmar com PIN*.
11. Close and reopen offline: the three drafts are still listed under *Por confirmar com PIN*.

**Private / Fecho offline**
12. Open *Área privada*: *A área privada precisa de ligação.* No PIN form.

**Reconnect**
13. Turn airplane mode off, bring the app to the front. Within a few seconds *registos por enviar* disappears; the
    service appears once in Hoje's *Recentes*. Check on Dev that exactly one record exists for that time.
14. The three drafts are still *por confirmar com PIN* (nothing was submitted by itself).
15. Open the Adiantamento draft, choose Gestor O, PIN `919191`, confirm → *Adiantamento registado com sucesso.* Only
    one advance exists on Dev; the draft count drops to 2.

**Conflict**
16. Offline again, save one service; reconnect only after the operator has deactivated *Serviço O* on Dev (or set the
    phone clock 10 minutes ahead before saving it, then back). Hoje shows *1 para rever*; *Para rever* explains it
    calmly, with no technical code; *Descartar* asks first and says nothing was registered on the server.
    (Reactivate *Serviço O* afterwards.)

**Fecho sync safety (two devices, `TEST-ORG-SYNC-2026`)**
17. Phone B (enrolled in the Sync salon) saves a service offline and stays offline. On phone A, as Gestor Sync, open
    the approval of today's period after it has ended (or of a period the operator chooses): *Há registos offline por
    sincronizar…*; the approve button is disabled.
18. Phone B reconnects and syncs; A taps *Atualizar*: the block clears once B has reported.
19. The operator revokes B (runbook §3): the period no longer waits for it; B, reopened, shows *Ligar este
    dispositivo* and sends nothing.

**Update**
20. Deploy a new build to the same URL while the app is open on a capture form: nothing reloads; the form keeps its
    values. Close the app completely and reopen: the new version is running; the pending items and drafts are kept.

**Storage**
21. Chrome → Site settings → the app → *Storage*: note the usage. Do **not** clear it with pending work — that loses it
    (the app cannot recover it from the server).

## B. iOS (Safari) — pilot gate

Run all of A on an iPhone with the current iOS, using Safari, with these differences and additions:

1. Install: Safari → Share → *Add to Home Screen*. Name *Beauty OS*, the Beauty OS icon. Launch from the home screen:
   standalone. Note: the home-screen app has **its own storage**, separate from Safari's tab — enroll *inside* the
   home-screen app (a code redeemed in the Safari tab does not carry over).
2. Service-worker persistence: after step A4–A6, the app must open in airplane mode from the home screen. Repeat after
   a phone restart.
3. IndexedDB persistence: pending items and drafts must survive a phone restart (A9, A11 after a restart).
4. Eviction risk (record, do not provoke on a pilot phone): Safari may delete website data of an app not opened for
   several days. Record whether the data survives **7 days without opening the app** on a test phone — this decides
   the operational advice ("open the app at least every few days; never leave work unsent").
5. *Por confirmar com PIN*, reconnect, private blocking, update (A10–A15, A12, A20) as on Android.
6. Note anything that differs from Android (prompts, the status bar, keyboard covering buttons) with screenshots.

## Recording the result

Update [pilot-readiness](pilot-readiness.md) (Offline V1 rows) with PASS / FAIL, the device model, OS and browser
version, and the date. A FAIL on any step that loses or duplicates a record, shows private data offline, or lets a
period close with unsent work is a **pilot blocker**.
