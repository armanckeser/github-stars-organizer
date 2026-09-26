import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // TanStack Router route files legitimately export both a component and a
      // `Route = createFileRoute(...)` const; downgrade to a warning.
      'react-refresh/only-export-components': 'warn',
      // react-hooks v7 RC flags idiomatic Date.now() during render as impure.
      'react-hooks/purity': 'off',
      // react-hooks v7 RC flags the standard prop->local-state sync effect.
      'react-hooks/set-state-in-effect': 'off',
      // react-hooks v7 RC cannot analyze third-party hooks (TanStack useReactTable).
      'react-hooks/incompatible-library': 'off',
    },
  },
])
