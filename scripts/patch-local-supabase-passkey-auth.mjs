#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');
const containerName = 'supabase_auth_missionpulse';
const tempEnvPath = resolve(rootDir, 'apps/landing/supabase/.temp/auth-passkey.env');
const passkeyEnv = new Map([
  ['GOTRUE_PASSKEY_ENABLED', 'true'],
  ['GOTRUE_WEBAUTHN_RP_DISPLAY_NAME', 'MissionPulse'],
  ['GOTRUE_WEBAUTHN_RP_ID', 'localhost'],
  ['GOTRUE_WEBAUTHN_RP_ORIGINS', 'http://localhost:5173,http://localhost:3024'],
]);

function docker(args) {
  return execFileSync('docker', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function inspect(format) {
  return docker(['inspect', containerName, '--format', format]);
}

function readEnv() {
  return inspect('{{range .Config.Env}}{{println .}}{{end}}')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function hasExpectedPasskeyEnv(envLines) {
  const values = new Map(envLines.map((line) => line.split(/=(.*)/s).slice(0, 2)));

  return Array.from(passkeyEnv).every(([key, value]) => values.get(key) === value);
}

function writePatchedEnvFile(envLines) {
  const passkeyKeys = new Set(passkeyEnv.keys());
  const preservedEnv = envLines.filter((line) => !passkeyKeys.has(line.split('=')[0]));
  const content = [
    ...preservedEnv,
    ...Array.from(passkeyEnv, ([key, value]) => `${key}=${value}`),
    '',
  ].join('\n');

  mkdirSync(resolve(rootDir, 'apps/landing/supabase/.temp'), { recursive: true });
  writeFileSync(tempEnvPath, content);
}

function main() {
  const envLines = readEnv();

  if (hasExpectedPasskeyEnv(envLines)) {
    console.log('Supabase Auth local a deja les variables passkey.');
    return;
  }

  const image = inspect('{{.Config.Image}}');
  const network = inspect('{{.HostConfig.NetworkMode}}');
  const user = inspect('{{.Config.User}}') || 'supabase';
  const cmd = JSON.parse(inspect('{{json .Config.Cmd}}'));

  writePatchedEnvFile(envLines);

  docker(['stop', containerName]);
  docker(['rm', containerName]);
  docker([
    'run',
    '-d',
    '--name',
    containerName,
    '--network',
    network,
    '--network-alias',
    'auth',
    '--user',
    user,
    '--env-file',
    tempEnvPath,
    image,
    ...cmd,
  ]);

  console.log('Supabase Auth local redemarre avec passkey active.');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
