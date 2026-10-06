# ADR-0009 — Shared-device principal and verified actor

**Status:** Proposed — **mechanism open, pending the bounded spike.** Do not implement until accepted.
**Related:** [Architecture Definition §7, §23](../architecture-definition.md#23-device--elevation-spike-specification) · 05 §3–§4 · 07 §8

## Context

The salon operates one shared smartphone (`Confirmed`). Ordinary capture must not require per-action login (05 §3). Sensitive actions must be attributed to an individual verified person (07 §8 B2–B10). The private context must not pass to the next holder (05 §4). Remote finance uses a personal device (01 §1), and personal devices must fit later (05 §2).

## Decision (conceptual, accepted direction)

- Two principal kinds: **device principal** (bound to exactly one organization, revocable) and **person principal**.
- Two attribution levels: **device + declared operator** (unverified) for ordinary records; **verified actor** for sensitive records.
- Two verification scopes: **one action** and **private session** (expiring, revocable, not inherited).
- The database resolves an **actor context** from each request; nothing about identity or verification is trusted from client input.

## Not decided

The concrete mechanism. Alternatives to evaluate (Architecture Definition §23.2):

- **A** anonymous user per device + enrollment, with server-side verification grants;
- **B** provisioned device account, with grants;
- **C** device session plus a separate person session for sensitive work;
- **D** short-lived server-issued token carrying the verified actor;
- **E** client-only PIN (baseline expected to fail).

## Acceptance

Requirements E-1…E-13, questions SQ-1…SQ-11 and acceptance/rejection criteria are in Architecture Definition §23. This ADR moves to *Accepted* (with the chosen mechanism) only on spike evidence reviewed at its own checkpoint.

## Deferred

- Verification secret format, lockout parameters and timeouts (also need product input on UX, 05 §3).
- Remote-person sign-in method (SQ-11).
