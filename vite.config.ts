/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { serviceWorkerShell } from './pwa/serviceWorkerPlugin'

export default defineConfig({
  plugins: [react(), serviceWorkerShell()],   // dist/sw.js: the static-shell service worker (ADR-0010 §7)
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'tests/pwa/**/*.test.ts'],   // tests/pwa: static checks of the install files (no network)
    setupFiles: ['src/test/setup.ts'],
  },
})
