/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'tests/pwa/**/*.test.ts'],   // tests/pwa: static checks of the install files (no network)
    setupFiles: ['src/test/setup.ts'],
  },
})
