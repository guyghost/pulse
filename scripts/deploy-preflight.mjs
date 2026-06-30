#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

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

function run(command) {
  console.log(`\n▶ ${command}`);
  execSync(command, { cwd: rootDir, stdio: 'inherit' });
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

function reportMissingRuntimeEnv() {
  const missing = [];

  for (const [app, keys] of Object.entries(REQUIRED_ENV)) {
    if (app.endsWith('Optional')) {
      continue;
    }

    for (const key of keys) {
      if (!process.env[key]?.trim()) {
        missing.push(`${app}: ${key}`);
      }
    }
  }

  if (missing.length === 0) {
    console.log('\n▶ Runtime env: all required production variables are set');
    return;
  }

  console.log('\n⚠ Runtime env: set these in Vercel before go-live:');
  for (const item of missing) {
    console.log(`  - ${item}`);
  }
}

console.log('MissionPulse deploy preflight\n');

run('pnpm format:check');
run('pnpm lint');
run('pnpm typecheck');
run('pnpm test');
run('pnpm build');
run('pnpm --filter @pulse/extension verify-manifest dist/manifest.json');

assertEnvExamplesDocumented();
assertNoDevArtifactsInExtensionBuild();
reportMissingRuntimeEnv();

console.log('\n✓ Deploy preflight passed (code). Configure Vercel/Supabase secrets if warnings above.\n');
