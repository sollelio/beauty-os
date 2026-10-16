import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'supabase'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Interactive Guide sandbox (learning experience L4b): synthetic data in memory only. No server, no operational data
    // or record hook, no offline store, no device storage. Domain shapes may still be imported as types.
    files: ['src/spaces/ajuda/guia/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [
        { group: ['**/modules/*/*', '!**/modules/org/OrganizationContext'], allowTypeImports: true, message: 'The guide uses synthetic data only (types are fine).' },
        { group: ['**/shared/offline/**', '!**/shared/offline/connectivity'], allowTypeImports: true, message: 'The guide never touches the offline store.' },
        { group: ['**/shared/supabase/**', '**/shared/query/**', '@supabase/*', '@tanstack/*', '**/RecordServiceFlow'], message: 'The guide never reaches the server or the real flow.' },
      ] }],
      'no-restricted-globals': ['error', 'localStorage', 'sessionStorage', 'indexedDB', 'fetch'],
    },
  },
  {
    files: ['pwa/sw.js'],                          // the service worker template (a classic script; build placeholders)
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.serviceworker, __BEAUTY_OS_PRECACHE__: 'readonly' } },
  },
  {
    files: ['scripts/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
)
