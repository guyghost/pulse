#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');
const landingEnvPath = resolve(rootDir, 'apps/landing/.env.local');
const dashboardEnvPath = resolve(rootDir, 'apps/dashboard/.env.local');

function readSupabaseStatusEnv() {
  try {
    return execFileSync('supabase', ['status', '--workdir', 'apps/landing', '-o', 'env'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr = error.stderr?.toString().trim();
    const details = stderr ? `\n\n${stderr}` : '';
    throw new Error(
      `Supabase local ne semble pas demarre. Lancez d'abord \`pnpm supabase:start\`.${details}`
    );
  }
}

function parseEnv(output) {
  const values = new Map();

  for (const line of output.split('\n')) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex);
    const value = parseEnvValue(trimmed.slice(separatorIndex + 1));
    values.set(key, value);
  }

  return values;
}

function parseEnvValue(rawValue) {
  const value = rawValue.trim();
  const quoteChar = value[0];

  if (
    value.length >= 2 &&
    (quoteChar === '"' || quoteChar === "'") &&
    value[value.length - 1] === quoteChar
  ) {
    if (quoteChar === '"') {
      try {
        return JSON.parse(value);
      } catch {
        return value.slice(1, -1);
      }
    }

    return value.slice(1, -1);
  }

  return value;
}

function requireAnyEnv(values, keys) {
  const value = keys.map((key) => values.get(key)).find(Boolean);

  if (!value) {
    throw new Error(
      `La sortie \`supabase status -o env\` ne contient aucun de: ${keys.join(', ')}.`
    );
  }

  return value;
}

function quote(value) {
  return JSON.stringify(value);
}

function writeEnvFile(path, entries) {
  mkdirSync(dirname(path), { recursive: true });

  const content = `${entries.map(([key, value]) => `${key}=${quote(value)}`).join('\n')}\n`;
  writeFileSync(path, content);
}

function main() {
  const statusEnv = parseEnv(readSupabaseStatusEnv());
  const supabaseUrl = requireAnyEnv(statusEnv, ['PUBLIC_SUPABASE_URL', 'SUPABASE_URL', 'API_URL']);
  const supabaseAnonKey = requireAnyEnv(statusEnv, [
    'PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
    'ANON_KEY',
  ]);
  const supabaseServiceRoleKey = requireAnyEnv(statusEnv, [
    'SUPABASE_SERVICE_ROLE_KEY',
    'SERVICE_ROLE_KEY',
  ]);

  let chromeStoreUrl = 'https://chromewebstore.google.com/search/MissionPulse';
  try {
    const currentLandingEnv = readFileSync(resolve(rootDir, 'apps/landing/.env'), 'utf8');
    const match = currentLandingEnv.match(/^PUBLIC_CHROME_STORE_URL=(.*)$/m);
    if (match?.[1]) {
      chromeStoreUrl = match[1].replace(/^["']|["']$/g, '');
    }
  } catch {
    // Optional developer-local file.
  }

  writeEnvFile(landingEnvPath, [
    ['PUBLIC_SUPABASE_URL', supabaseUrl],
    ['PUBLIC_SUPABASE_ANON_KEY', supabaseAnonKey],
    ['SUPABASE_SERVICE_ROLE_KEY', supabaseServiceRoleKey],
    ['PUBLIC_CHROME_STORE_URL', chromeStoreUrl],
    ['LEMON_SQUEEZY_WEBHOOK_SECRET', ''],
    ['LEMON_SQUEEZY_STORE_ID', ''],
    ['GLM_API_KEY', ''],
    ['GLM_MODEL', 'glm-4-flash'],
  ]);

  writeEnvFile(dashboardEnvPath, [
    ['PUBLIC_SUPABASE_URL', supabaseUrl],
    ['PUBLIC_SUPABASE_ANON_KEY', supabaseAnonKey],
  ]);

  console.log(`Variables Supabase locales ecrites dans:
- ${landingEnvPath}
- ${dashboardEnvPath}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
