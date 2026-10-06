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

### Quality gates

```sh
npm run typecheck
npm run lint
npm run build
```

### Database migrations (remote Dev)

Migrations live in `supabase/migrations/` and are applied to the Dev project with the Supabase CLI (installed as a dev dependency):

```sh
npx supabase login                                      # once per machine (browser sign-in)
npx supabase link --project-ref plukxnjnmowlnplpgsnm    # once per clone; asks for the Dev database password
npx supabase migration new <name>                       # create a migration file, then edit it
npx supabase db push                                    # apply pending migrations to the linked Dev project
```

Never create tables through the Dashboard. Never link a production project to this workflow.
