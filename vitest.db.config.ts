// Database/security tests run against the remote Supabase Dev project (no local stack), using the
// dedicated "Teste Isolamento A/B" organizations from supabase/seed.sql.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/db/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
