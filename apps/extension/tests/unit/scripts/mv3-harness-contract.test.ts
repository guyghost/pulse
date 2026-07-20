import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const extensionRoot = resolve(import.meta.dirname, '../../..');
const repositoryRoot = resolve(extensionRoot, '../..');

describe('packaged MV3 harness contract', () => {
  it('exposes test:mv3 as the canonical command and keeps the legacy command as an alias', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(extensionRoot, 'package.json'), 'utf8')
    ) as { scripts?: Record<string, string> };
    const canonical = packageJson.scripts?.['test:mv3'];

    expect(packageJson.scripts).toHaveProperty('test:mv3');
    if (canonical === undefined) {
      return;
    }
    expect(canonical).toContain('playwright.mv3.config.ts');
    expect(canonical).toContain('verify-manifest');
    expect(packageJson.scripts?.['test:e2e:extension']).toBe('pnpm test:mv3');
  });

  it('provides the canonical config and discovers future tests/mv3 scenarios', () => {
    const configPath = resolve(extensionRoot, 'playwright.mv3.config.ts');
    expect(existsSync(configPath), 'playwright.mv3.config.ts must exist').toBe(true);
    if (!existsSync(configPath)) {
      return;
    }

    const config = readFileSync(configPath, 'utf8');
    expect(config).toContain("testDir: './tests'");
    expect(config).toContain("'mv3/**/*.test.ts'");
    expect(
      existsSync(resolve(extensionRoot, 'tests/mv3/fixtures.ts')),
      'tests/mv3/fixtures.ts must be the canonical fixture entrypoint'
    ).toBe(true);
  });

  it('runs the exact MV3 gate in dedicated CI and always uploads its evidence', () => {
    const workflow = readFileSync(resolve(repositoryRoot, '.github/workflows/ci.yml'), 'utf8');

    expect(workflow).toMatch(/test-mv3:/);
    expect(workflow).toContain('playwright install --with-deps chromium');
    expect(workflow).toContain('pnpm --filter @pulse/extension test:mv3');
    expect(workflow).toContain('path: output/playwright/');
    expect(workflow).toMatch(/name: Upload MV3 Playwright evidence[\s\S]*if: always\(\)/);
  });
});
