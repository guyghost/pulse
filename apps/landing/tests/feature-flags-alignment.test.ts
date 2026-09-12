import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXTENSION_SURFACE_FLAGS } from '@pulse/domain';

const testDir = dirname(fileURLToPath(import.meta.url));
const landingDir = resolve(testDir, '..');
const homePage = readFileSync(resolve(landingDir, 'src/routes/+page.svelte'), 'utf8');

describe('landing / extension surface flag alignment', () => {
  it('derives the homepage discourse from the shared domain flags', () => {
    expect(homePage).toContain("import { EXTENSION_SURFACE_FLAGS } from '@pulse/domain'");
    expect(homePage).toContain('const trackingLive = EXTENSION_SURFACE_FLAGS.applications');
  });

  it('only constructs the tracking feature row when the extension ships it', () => {
    expect(homePage).toContain('...(trackingLive');

    if (!EXTENSION_SURFACE_FLAGS.applications) {
      expect(homePage).not.toContain("tier: 'soon'");
      expect(homePage).not.toContain('En cours d’activation');
    }
  });

  it('omits the connected layer entirely while its launch flag is off', () => {
    expect(EXTENSION_SURFACE_FLAGS.connected).toBe(false);
    expect(homePage).not.toContain('const connectedLive = EXTENSION_SURFACE_FLAGS.connected');
    expect(homePage).not.toContain('{#if connectedLive}');
    expect(homePage).not.toContain('/register');
    expect(homePage).not.toContain('/dashboard');
    expect(homePage).not.toContain('aria-disabled="true"');
  });
});
