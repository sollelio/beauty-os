/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { serviceWorkerShell } from './pwa/serviceWorkerPlugin'
import { ANDROID_ENV_DIR, androidEnvironment, androidEnvironmentOf } from './scripts/androidEnvironment'

export default defineConfig(({ mode }) => {
  // Android flavors (ADR-0011): --mode android-dev / android-prod read only android/env (never the root .env.local) and
  // are refused unless they point at their own Supabase project. Every other build is unchanged.
  const android = androidEnvironmentOf(mode)
  return {
    ...(android ? { envDir: ANDROID_ENV_DIR } : {}),
    plugins: [react(), serviceWorkerShell(), ...(android ? [androidEnvironment(android)] : [])],   // dist/sw.js: the static-shell service worker (ADR-0010 §7)
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}', 'tests/pwa/**/*.test.ts', 'tests/android/**/*.test.ts'],   // tests/pwa, tests/android: static checks (no network)
      setupFiles: ['src/test/setup.ts'],
    },
  }
})
