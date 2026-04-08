/**
 * ESLint Flat Configuration for MissionPulse
 *
 * ESLint v9 flat config format with:
 * - TypeScript strict mode + type-checked rules
 * - Svelte 5 with runes syntax support
 * - Functional Core / Imperative Shell architecture enforcement
 * - Chrome Extension API globals
 */

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default tseslint.config(
  // ─── Global ignores ──────────────────────────────────────────────────
  {
    ignores: [
      'dist/',
      'node_modules/',
      '.svelte-kit/',
      'coverage/',
      'test-results/',
      'landing/',
      // Svelte files that use svelte:boundary (not supported by eslint-plugin-svelte yet)
      'src/sidepanel/App.svelte',
      '.claude/',
      '.worktrees/',
    ],
  },

  // ─── Base: ESLint recommended rules ──────────────────────────────────
  js.configs.recommended,

  // ─── Svelte: recommended + prettier-compatible rules ─────────────────
  // These are properly scoped to **/*.svelte files
  ...svelte.configs['flat/recommended'],
  ...svelte.configs['flat/prettier'],

  // ─── TypeScript files: recommended + type-checked rules ──────────────
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
      },
      globals: {
        ...globals.browser,
        ...globals.es2022,
        ...globals.node,
        chrome: 'readonly',
      },
    },
    rules: {
      // TypeScript strict enforcement
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // Disable base rules that conflict with TS versions
      'no-undef': 'off', // TypeScript handles this
      'no-unused-vars': 'off', // Use @typescript-eslint/no-unused-vars instead
    },
  },

  // ─── Svelte files: TypeScript parser for <script> blocks ─────────────
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.svelte'],
      },
      globals: {
        ...globals.browser,
        chrome: 'readonly',
        $state: 'readonly',
        $derived: 'readonly',
        $effect: 'readonly',
        $props: 'readonly',
        $bindable: 'readonly',
        $inspect: 'readonly',
      },
    },
    rules: {
      'svelte/no-dom-manipulating': 'warn',
      'no-undef': 'off',
      'no-unused-vars': 'off',
      // Disable rules that conflict with Svelte 5 features (svelte:boundary, etc.)
      'svelte/valid-compile': 'off',
    },
  },

  // ─── Svelte parser errors: ignore files using svelte:boundary (not yet supported) ──
  {
    files: ['src/sidepanel/App.svelte'],
    rules: {
      // svelte:boundary causes "Unknown type:SvelteBoundary" parser error
      // This is a known eslint-plugin-svelte limitation with Svelte 5
    },
  },

  // ─── Architecture: Core/Shell boundary enforcement ───────────────────
  {
    files: ['**/*.ts', '**/*.svelte'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'svelte/store',
              message: 'Use Svelte 5 $state runes for state management, not legacy svelte stores.',
            },
          ],
          patterns: [
            {
              group: ['**/shell/**'],
              importNames: ['*'],
              message:
                'Core modules MUST NOT import from shell. Shell calls Core, never the reverse.',
            },
          ],
        },
      ],
    },
  },

  // ─── General code quality ────────────────────────────────────────────
  {
    files: ['**/*.ts', '**/*.svelte'],
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error', 'debug'] }],
      'prefer-const': 'warn',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
    },
  },

  // ─── Test files: relaxed rules + vitest globals ─────────────────────
  {
    files: ['**/*.test.ts', '**/*.spec.ts', 'tests/**/*.ts'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
      'no-undef': 'off',
    },
  },

  // ─── Dev files: allow console ────────────────────────────────────────
  {
    files: ['src/dev/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // ─── Node.js scripts & config files ──────────────────────────────────
  {
    files: ['scripts/**/*.ts', 'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts'],
    rules: {
      'no-console': 'off',
    },
  }
);
