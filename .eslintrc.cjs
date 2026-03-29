/**
 * ESLint Configuration for MissionPulse
 *
 * This configuration enforces code quality standards for:
 * - TypeScript strict mode
 * - Svelte 5 runes syntax
 * - Functional Core / Imperative Shell architecture
 */

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:svelte/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    extraFileExtensions: ['.svelte'],
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'svelte'],
  rules: {
    // TypeScript strict rules
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/prefer-optional-chain': 'error',
    '@typescript-eslint/no-unnecessary-condition': 'warn',
    '@typescript-eslint/no-unnecessary-type-assertion': 'error',

    // Functional Core / Imperative Shell enforcement
    // Warn when shell imports are detected in core (should use @restricted-imports plugin ideally)
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/shell/**'],
            importNames: ['*'],
            message:
              'Core modules MUST NOT import from shell. Shell calls Core, never the reverse.',
          },
        ],
        paths: [
          {
            name: 'svelte/store',
            message: 'Use Svelte 5 $state runes for state management, not legacy svelte stores.',
          },
        ],
      },
    ],

    // Svelte 5 runes enforcement
    'svelte/no-store-async': 'error',
    'svelte/valid-compile': 'error',
    'svelte/no-unused-svelte-ignore': 'warn',

    // General code quality
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'prefer-const': 'error',
    'no-var': 'error',
    eqeqeq: ['error', 'always'],
    curly: ['error', 'all'],
  },
  overrides: [
    // Svelte files
    {
      files: ['*.svelte'],
      parser: 'svelte-eslint-parser',
      parserOptions: {
        parser: '@typescript-eslint/parser',
      },
      rules: {
        // Svelte 5 specific
        'svelte/no-dom-props': 'warn',
      },
    },
    // Test files - relax some rules
    {
      files: ['**/*.test.ts', '**/*.spec.ts', 'tests/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        'no-console': 'off',
      },
    },
    // Dev files
    {
      files: ['src/dev/**/*.ts'],
      rules: {
        'no-console': 'off',
      },
    },
    // Node.js scripts
    {
      files: ['scripts/**/*.ts', 'vite.config.ts', 'playwright.config.ts'],
      rules: {
        'no-console': 'off',
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
  ignorePatterns: ['node_modules/', 'dist/', '.svelte-kit/', '*.js', '*.cjs', '!.eslintrc.cjs'],
};
