import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const privateServerEnvNames = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'LEMON_SQUEEZY_WEBHOOK_SECRET',
  'LEMON_SQUEEZY_STORE_ID',
  'GLM_API_KEY',
  'GLM_MODEL',
] as const;

describe('secret exposure guards', () => {
  it('does not expose private server variables through the global Turbo build env', () => {
    const turbo = JSON.parse(readFileSync('../../turbo.json', 'utf8')) as {
      tasks?: { build?: { env?: string[] } };
    };
    const buildEnv = turbo.tasks?.build?.env ?? [];

    for (const envName of privateServerEnvNames) {
      expect(buildEnv).not.toContain(envName);
    }
  });

  it('keeps private server variables out of PUBLIC_* names', () => {
    const publicPrivateNames = privateServerEnvNames.filter((envName) =>
      envName.startsWith('PUBLIC_')
    );

    expect(publicPrivateNames).toEqual([]);
  });

  it('does not reference private server variables from extension source', () => {
    const matches = execSync(
      `rg --fixed-strings --line-number ${privateServerEnvNames
        .map((name) => `-e ${name}`)
        .join(' ')} src || true`,
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      }
    )
      .trim()
      .split('\n')
      .filter(Boolean);

    expect(matches).toEqual([]);
  });
});
