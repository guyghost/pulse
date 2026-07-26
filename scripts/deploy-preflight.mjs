#!/usr/bin/env node

import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = resolve(import.meta.dirname, '..');

const REQUIRED_ENV = {
  landing: [
    'PUBLIC_SUPABASE_URL',
    'PUBLIC_SUPABASE_ANON_KEY',
    'PUBLIC_LANDING_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ],
  landingOptional: [
    'PUBLIC_CHROME_STORE_URL',
    'GLM_API_KEY',
    'LEMON_SQUEEZY_API_KEY',
    'LEMON_SQUEEZY_STORE_ID',
    'LEMON_SQUEEZY_WEBHOOK_SECRET',
  ],
  dashboard: ['PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_ANON_KEY', 'PUBLIC_LANDING_URL'],
};

const PREFLIGHT_MODES = new Set(['production', 'inspection']);

function run(command) {
  console.log(`\n▶ ${command}`);
  execSync(command, { cwd: rootDir, stdio: 'inherit' });
}

function runStructuredCommand({ command, args }) {
  console.log(`\n▶ ${[command, ...args].join(' ')}`);
  execFileSync(command, args, { cwd: rootDir, stdio: 'inherit' });
}

export function createManifestValidationCommand(expectedVersion) {
  const version = expectedVersion.trim();
  if (!version) {
    throw new Error('Expected release version is required for built manifest validation');
  }

  return {
    command: 'pnpm',
    args: [
      '--filter',
      '@pulse/extension',
      'verify-manifest',
      'dist/manifest.json',
      '--post-build',
      '--expected-version',
      version,
    ],
  };
}

export function evaluateRuntimeEnvironment(environment, mode) {
  if (!PREFLIGHT_MODES.has(mode)) {
    throw new Error(`Invalid preflight mode: ${mode}`);
  }

  const missing = [];

  for (const [app, keys] of Object.entries(REQUIRED_ENV)) {
    if (app.endsWith('Optional')) {
      continue;
    }

    for (const key of keys) {
      if (!environment[key]?.trim()) {
        missing.push(`${app}: ${key}`);
      }
    }
  }

  return {
    missing,
    exitCode: mode === 'production' && missing.length > 0 ? 1 : 0,
  };
}

function parsePreflightArgs(rawArgs) {
  let mode = 'production';
  let expectedVersion = null;
  const args = [...rawArgs];

  while (args.length > 0) {
    const arg = args.shift();

    if (arg === '--mode') {
      const value = args.shift();
      if (!value || !PREFLIGHT_MODES.has(value)) {
        throw new Error('--mode must be either "production" or "inspection"');
      }
      mode = value;
      continue;
    }

    if (arg === '--expected-version') {
      const value = args.shift()?.trim();
      if (!value) {
        throw new Error('--expected-version requires a non-empty value');
      }
      expectedVersion = value;
      continue;
    }

    throw new Error(`Unknown deploy preflight argument: ${arg}`);
  }

  return { mode, expectedVersion };
}

function readExpectedVersion(environment, cliExpectedVersion) {
  const environmentVersion = environment.EXPECTED_VERSION?.trim();
  if (cliExpectedVersion) {
    return cliExpectedVersion;
  }
  if (environmentVersion) {
    return environmentVersion;
  }

  const packageJson = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
  if (typeof packageJson.version !== 'string' || !packageJson.version.trim()) {
    throw new Error('Root package.json must define the expected release version');
  }
  return packageJson.version.trim();
}

function readEnvExampleKeys(app) {
  const path = resolve(rootDir, `apps/${app}/.env.example`);
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}`);
  }

  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('=')[0])
    .filter(Boolean);
}

function assertEnvExamplesDocumented() {
  console.log('\n▶ Verifying .env.example coverage');

  for (const [app, required] of Object.entries(REQUIRED_ENV)) {
    if (app.endsWith('Optional')) {
      continue;
    }

    const documented = new Set(readEnvExampleKeys(app));
    const missing = required.filter((key) => !documented.has(key));

    if (missing.length > 0) {
      throw new Error(`apps/${app}/.env.example missing keys: ${missing.join(', ')}`);
    }
  }

  console.log('  ✓ Required env vars documented in .env.example files');
}

function assertNoDevArtifactsInExtensionBuild() {
  const distDir = resolve(rootDir, 'apps/extension/dist');
  if (!existsSync(distDir)) {
    throw new Error('Extension dist/ missing — run build first');
  }

  const forbidden = ['bootstrapDevMode', 'DevPanel', 'chrome-stubs', 'qa-seed'];
  const stack = [distDir];
  const hits = [];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = resolve(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (!/\.(js|html|json)$/i.test(entry.name)) {
        continue;
      }

      const content = readFileSync(fullPath, 'utf8');
      for (const token of forbidden) {
        if (content.includes(token)) {
          hits.push(`${fullPath} (${token})`);
        }
      }
    }
  }

  if (hits.length > 0) {
    throw new Error(`Dev artifacts found in extension dist:\n${hits.join('\n')}`);
  }

  console.log('  ✓ Extension dist has no dev-only artifacts');
}

function reportRuntimeEnvironment(result, mode) {
  if (result.missing.length === 0) {
    console.log('\n▶ Runtime env: all required production variables are set');
    return;
  }

  const log = mode === 'production' ? console.error : console.warn;
  log(
    mode === 'production'
      ? '\n✗ Runtime env: missing required production variables:'
      : '\n⚠ Runtime env inspection: missing required production variables:'
  );
  for (const item of result.missing) {
    log(`  - ${item}`);
  }
}

export function main(rawArgs = process.argv.slice(2), environment = process.env) {
  const { mode, expectedVersion: cliExpectedVersion } = parsePreflightArgs(rawArgs);
  const runtimeEnvironment = evaluateRuntimeEnvironment(environment, mode);

  console.log(`MissionPulse deploy preflight (${mode})\n`);
  reportRuntimeEnvironment(runtimeEnvironment, mode);

  if (runtimeEnvironment.exitCode !== 0) {
    console.error('\n✗ Deploy preflight blocked by missing production configuration.\n');
    return runtimeEnvironment.exitCode;
  }

  const expectedVersion = readExpectedVersion(environment, cliExpectedVersion);

  run('pnpm format:check');
  run('pnpm lint');
  run('pnpm typecheck');
  run('pnpm test');
  run('pnpm build');
  runStructuredCommand(createManifestValidationCommand(expectedVersion));

  assertEnvExamplesDocumented();
  assertNoDevArtifactsInExtensionBuild();

  console.log(`\n✓ Deploy preflight passed (${mode}).\n`);
  return 0;
}

const invokedUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedUrl === import.meta.url) {
  process.exitCode = main();
}
