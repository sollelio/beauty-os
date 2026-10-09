# beauty-os

Beauty OS web application (React + TypeScript + Vite). Product and architecture docs: [`docs/`](docs/) · rules: [`CLAUDE.md`](CLAUDE.md).

## Development environment

- The app runs locally and talks to the remote **Supabase Dev** project (`Beauty OS Dev`, ref `plukxnjnmowlnplpgsnm`).
- **No local Supabase / Docker stack is used.** No production infrastructure exists yet.

### Setup

```sh
npm install
cp .env.example .env.local   # then fill in the two values below
npm run check:supabase       # optional: verifies the Dev project answers with your key
npm run dev
```

`.env.local` (never committed):

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://plukxnjnmowlnplpgsnm.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the Dev project's **publishable** key (`sb_publishable_…`). Never a secret/service-role key. |

### Enroll the development device

Open the app: an unbound browser shows **Ligar este dispositivo**. Enter the development code **`DEV-SALAO-2026`** (organization *Salão Demo (Dev)*, synthetic data from `supabase/seed.sql`). The browser becomes an anonymous device principal bound to that organization (ADR-0009) and keeps the session across reloads. To enroll again, clear the site's storage.

Sensitive actions (*Adiantamento*, *Despesa*, *Compra*) need a verified person: on *Confirmação necessária* choose **Duarte** and enter the development PIN **`135790`** (synthetic; five wrong PINs lock that person for 15 minutes).

*Área privada* (Slice 04) opens a short private context (5 minutes; it also ends on *Sair* or when the area is left). Synthetic Dev PINs: **Duarte** `135790` (team finance: Equipa → any person), **Ana** `246810`, **Bruno** `975310`, **Carla** `864200` (own situation only). Dev cases: Ana — determinate rule, Agosto fechado / Setembro em pagamento with recorded payments; Carla — Setembro advances above earned (excess); Bruno — rule pending.

*Stock* (Slice 05) opens from Hoje (quick action, or the *Atenção* row when products are marked *Comprar*). State (OK · Baixo · Comprar), level and reserve units are set by people and kept with an append-only history; a recorded purchase never changes them. *Preparar compra* → *Ir às compras* starts a market trip kept on this device until the real purchase is recorded through *Registar compra*.

*Fecho* (Slice 06) lives in the private area (team-finance holders). Its decisions use *Confirmação necessária* with a person holding the boundary's permission (Duarte in Salão Demo). The Slice 06 sample is in a separate organization, **Salão Fecho (Dev)** — enrollment code `DEV-FECHO-2026`, Mercy `135790`, Fernando (sócio) `246810` — with Outubro and two spare periods. A closed period accepts no new records, and neither does an approved one (07 D7); reopening (mandatory reason) returns a closed period to *Em pagamento* or *Pronto para pagamento*. Test organization C (`TEST-ORG-C-2026`) is used only by the DB tests. *Negócio → Visão geral* (Business Health) needs `business.health.read` (Fernando and Mercy in Salão Fecho); test organization E (`TEST-ORG-E-2026`: manager `515151`, business-only `525252`, business-only who also earns `545454`) holds its fixtures; *Negócio → Equipa* uses test organization D (`TEST-ORG-D-2026`: manager `616161`, business-only `626262`), *Negócio → Serviços* test organization S (`TEST-ORG-S-2026`: manager `717171`, business-only `727272`), *Negócio → Custos & Stock* test organization K (`TEST-ORG-K-2026`: manager `818181`, business-only `828282`). The DB tests consume one-day *Ciclo Teste* periods in test organization A; add a seed file with more when they run out.

### Quality gates and tests

```sh
npm run typecheck
npm run lint
npm run build
npm test            # frontend unit tests (jsdom)
npm run test:db     # database/security tests against Supabase Dev (uses the "Teste Isolamento A/B" organizations)
```

`test:db` refuses to run unless `.env.local` points at the Dev project. Each run creates a few anonymous Auth users in Dev (anonymous sign-ins are rate-limited per IP).

### Database migrations (remote Dev)

Migrations live in `supabase/migrations/` and are applied to the Dev project with the Supabase CLI (installed as a dev dependency):

```sh
npx supabase login                                      # once per machine (browser sign-in)
npx supabase link --project-ref plukxnjnmowlnplpgsnm    # once per clone; asks for the Dev database password
npx supabase migration new <name>                       # create a migration file, then edit it
npx supabase db push --dry-run --include-seed           # review what would be applied
npx supabase db push --include-seed                     # apply pending migrations (+ idempotent synthetic seeds) to Dev
npx supabase config push                                # Auth settings in supabase/config.toml (e.g. anonymous sign-ins); review each prompt
```

Seeds live in `supabase/seeds/*.sql` and are synthetic. The CLI runs each seed file once and does not re-run an edited file, so add a new seed file for new data.

Never create tables through the Dashboard. Never link a production project to this workflow.
