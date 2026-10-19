# Android web-build environments (ADR-0011)

Android builds (`vite build --mode android-dev|android-prod`, run by `npm run android:sync:dev|prod`) read their
environment **only from this directory**, never from the repository root's `.env.local`. Create the file for the
environment you build; both are ignored by Git. Public values only — never a secret or service-role key.

`.env.android-dev.local` — Supabase **Dev** (`plukxnjnmowlnplpgsnm`), application `com.sollelio.beautyos.dev`:

```
VITE_SUPABASE_URL=https://plukxnjnmowlnplpgsnm.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
```

`.env.android-prod.local` — Supabase **Prod** (`kzirzmtarnskwirufyjw`), application `com.sollelio.beautyos`; CAPTCHA required.
**Prod builds are refused until the WebView hostname is approved** (`webViewHostname` is `null` in `android/environments.json`):

```
VITE_SUPABASE_URL=https://kzirzmtarnskwirufyjw.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
VITE_TURNSTILE_SITE_KEY=…
```

The build is refused unless the values match the environment (`scripts/androidEnvironment.ts`, from
`android/environments.json`); the Gradle build then refuses a flavor whose synced bundle was built for the other one.
