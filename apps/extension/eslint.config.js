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
  // Extract rules from tseslint configs and scope to .ts files only
  // (the spread configs have `files: undefined` which hits .js files)
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
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
      // TypeScript strict enforcement (override defaults)
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
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
    },
    rules: {
      'svelte/no-dom-manipulating': 'warn',
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
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
    },
  },

  // ─── Test files: relaxed rules ───────────────────────────────────────
  {
    files: ['**/*.test.ts', '**/*.spec.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
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
