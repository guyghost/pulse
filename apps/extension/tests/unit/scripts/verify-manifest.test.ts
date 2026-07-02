import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  parseArgs,
  validateLinkedInProfileImportPermissions,
  validateSchema,
  validateVersionConsistency,
} from '../../../scripts/verify-manifest.ts';

// ── Minimal valid manifest fixture ──────────────────────────────────

const MINIMAL_VALID_MANIFEST = {
  manifest_version: 3,
  name: 'MissionPulse',
  version: '0.1.0',
};

const FULL_REAL_MANIFEST = {
  manifest_version: 3,
  name: 'MissionPulse',
  version: '0.2.1',
  description: 'Agent freelance : feed de missions centralisé avec scoring et analyse TJM',
  minimum_chrome_version: '114',
  permissions: [
    'sidePanel',
    'storage',
    'cookies',
    'alarms',
    'notifications',
    'declarativeNetRequest',
    'scripting',
    'activeTab',
  ],
  host_permissions: [
    'https://www.free-work.com/*',
    'https://*.lehibou.com/*',
    'https://hiway-missions.fr/*',
  ],
  optional_host_permissions: ['https://www.linkedin.com/*'],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  action: {
    default_title: 'MissionPulse',
  },
  icons: {
    '16': 'static/icons/icon-16.png',
    '48': 'static/icons/icon-48.png',
    '128': 'static/icons/icon-128.png',
  },
};

// ── Tests ──────────────────────────────────────────────────────────

describe('validateSchema', () => {
  /**
   * OpenSpec scenario: Valid minimal manifest passes schema validation.
   * GIVEN a minimal valid MV3 manifest
   * WHEN validating schema
   * THEN returns success with data
   */
  it('should accept a minimal valid MV3 manifest', () => {
    const result = validateSchema(MINIMAL_VALID_MANIFEST);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('MissionPulse');
      expect(result.data.version).toBe('0.1.0');
      expect(result.data.manifest_version).toBe(3);
    }
  });

  /**
   * OpenSpec scenario: Full real manifest passes schema validation.
   * GIVEN the actual project manifest with all fields
   * WHEN validating schema
   * THEN returns success
   */
  it('should accept the full real project manifest', () => {
    const result = validateSchema(FULL_REAL_MANIFEST);
    expect(result.success).toBe(true);
  });

  /**
   * OpenSpec scenario: Reject MV2 manifests.
   * GIVEN a manifest with manifest_version: 2
   * WHEN validating schema
   * THEN returns failure with clear error about MV3
   */
  it('should reject manifest_version 2 (MV2 not supported)', () => {
    const result = validateSchema({ ...MINIMAL_VALID_MANIFEST, manifest_version: 2 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('manifest_version must be 3')])
      );
    }
  });

  /**
   * OpenSpec scenario: Reject manifest with missing name.
   * GIVEN a manifest without name
   * WHEN validating schema
   * THEN returns failure
   */
  it('should reject manifest without name', () => {
    const { name, ...withoutName } = MINIMAL_VALID_MANIFEST;
    const result = validateSchema(withoutName);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('name')]));
    }
  });

  /**
   * OpenSpec scenario: Reject manifest with empty name.
   * GIVEN a manifest with name: ""
   * WHEN validating schema
   * THEN returns failure
   */
  it('should reject manifest with empty name', () => {
    const result = validateSchema({ ...MINIMAL_VALID_MANIFEST, name: '' });
    expect(result.success).toBe(false);
  });

  /**
   * OpenSpec scenario: Reject invalid version formats.
   * GIVEN a manifest with version "abc"
   * WHEN validating schema
   * THEN returns failure with version format error
   */
  it('should reject non-semver version strings', () => {
    const result = validateSchema({ ...MINIMAL_VALID_MANIFEST, version: 'abc' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('version')]));
    }
  });

  /**
   * OpenSpec scenario: Accept semver with prerelease suffix.
   * GIVEN a manifest with version "1.0.0-beta.1"
   * WHEN validating schema
   * THEN returns success (regex only requires X.Y.Z prefix)
   */
  it('should accept semver with prerelease suffix', () => {
    const result = validateSchema({ ...MINIMAL_VALID_MANIFEST, version: '1.0.0-beta.1' });
    expect(result.success).toBe(true);
  });

  /**
   * OpenSpec scenario: Accept semver with patch only.
   * GIVEN version "0.0.1"
   * WHEN validating
   * THEN passes
   */
  it('should accept minimal patch version 0.0.1', () => {
    const result = validateSchema({ ...MINIMAL_VALID_MANIFEST, version: '0.0.1' });
    expect(result.success).toBe(true);
  });

  /**
   * OpenSpec scenario: Accept large version numbers.
   * GIVEN version "100.200.300"
   * WHEN validating
   * THEN passes
   */
  it('should accept large version numbers', () => {
    const result = validateSchema({ ...MINIMAL_VALID_MANIFEST, version: '100.200.300' });
    expect(result.success).toBe(true);
  });

  /**
   * OpenSpec scenario: Reject single number version.
   * GIVEN version "1"
   * WHEN validating
   * THEN fails
   */
  it('should reject single number version "1"', () => {
    const result = validateSchema({ ...MINIMAL_VALID_MANIFEST, version: '1' });
    expect(result.success).toBe(false);
  });

  /**
   * OpenSpec scenario: Reject two-part version.
   * GIVEN version "1.0"
   * WHEN validating
   * THEN fails
   */
  it('should reject two-part version "1.0"', () => {
    const result = validateSchema({ ...MINIMAL_VALID_MANIFEST, version: '1.0' });
    expect(result.success).toBe(false);
  });

  /**
   * OpenSpec scenario: Reject leading-v version.
   * GIVEN version "v1.0.0"
   * WHEN validating
   * THEN fails (v prefix is not part of semver format in manifest)
   */
  it('should reject v-prefixed version "v1.0.0"', () => {
    const result = validateSchema({ ...MINIMAL_VALID_MANIFEST, version: 'v1.0.0' });
    expect(result.success).toBe(false);
  });

  /**
   * OpenSpec scenario: Accept manifest with permissions array.
   */
  it('should accept manifest with permissions array', () => {
    const result = validateSchema({
      ...MINIMAL_VALID_MANIFEST,
      permissions: ['storage', 'cookies'],
    });
    expect(result.success).toBe(true);
  });

  it('should preserve optional host permissions for least-privilege platform access', () => {
    const result = validateSchema({
      ...MINIMAL_VALID_MANIFEST,
      optional_host_permissions: ['https://www.linkedin.com/*'],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.optional_host_permissions).toEqual(['https://www.linkedin.com/*']);
    }
  });

  /**
   * OpenSpec scenario: Accept manifest with background service_worker.
   */
  it('should accept manifest with module service worker', () => {
    const result = validateSchema({
      ...MINIMAL_VALID_MANIFEST,
      background: {
        service_worker: 'background.js',
        type: 'module',
      },
    });
    expect(result.success).toBe(true);
  });

  /**
   * OpenSpec scenario: Accept manifest with classic service worker.
   */
  it('should accept manifest with classic service worker', () => {
    const result = validateSchema({
      ...MINIMAL_VALID_MANIFEST,
      background: {
        service_worker: 'background.js',
        type: 'classic',
      },
    });
    expect(result.success).toBe(true);
  });

  /**
   * OpenSpec scenario: Reject background with invalid type.
   */
  it('should reject background with invalid type', () => {
    const result = validateSchema({
      ...MINIMAL_VALID_MANIFEST,
      background: {
        service_worker: 'background.js',
        type: 'invalid',
      },
    });
    expect(result.success).toBe(false);
  });

  /**
   * OpenSpec scenario: Accept manifest with side_panel.
   */
  it('should accept manifest with side_panel', () => {
    const result = validateSchema({
      ...MINIMAL_VALID_MANIFEST,
      side_panel: {
        default_path: 'sidepanel.html',
      },
    });
    expect(result.success).toBe(true);
  });

  /**
   * OpenSpec scenario: Accept manifest with icons as string-keyed record.
   */
  it('should accept manifest with icons', () => {
    const result = validateSchema({
      ...MINIMAL_VALID_MANIFEST,
      icons: {
        '16': 'icon16.png',
        '48': 'icon48.png',
        '128': 'icon128.png',
      },
    });
    expect(result.success).toBe(true);
  });

  /**
   * OpenSpec scenario: Reject icons with non-numeric keys.
   */
  it('should reject icons with non-numeric keys', () => {
    const result = validateSchema({
      ...MINIMAL_VALID_MANIFEST,
      icons: {
        small: 'icon16.png',
      },
    });
    expect(result.success).toBe(false);
  });

  /**
   * OpenSpec scenario: Reject completely empty object.
   */
  it('should reject empty manifest object', () => {
    const result = validateSchema({});
    expect(result.success).toBe(false);
    if (!result.success) {
      // Should report multiple missing required fields
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    }
  });

  /**
   * OpenSpec scenario: Reject non-object input (e.g. string).
   */
  it('should reject non-object input', () => {
    const result = validateSchema('not a manifest');
    expect(result.success).toBe(false);
  });

  /**
   * OpenSpec scenario: Reject null input.
   */
  it('should reject null input', () => {
    const result = validateSchema(null);
    expect(result.success).toBe(false);
  });

  /**
   * OpenSpec scenario: Accept manifest with content_scripts.
   */
  it('should accept manifest with content_scripts', () => {
    const result = validateSchema({
      ...MINIMAL_VALID_MANIFEST,
      content_scripts: [
        {
          matches: ['https://*.example.com/*'],
          js: ['content.js'],
          css: ['content.css'],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  /**
   * OpenSpec scenario: Reject manifest_version as string.
   */
  it('should reject manifest_version as string "3"', () => {
    const result = validateSchema({ ...MINIMAL_VALID_MANIFEST, manifest_version: '3' });
    expect(result.success).toBe(false);
  });
});

describe('parseArgs', () => {
  it('should parse manifest path and expected version together', () => {
    expect(parseArgs(['dist/manifest.json', '--expected-version', '1.2.3'])).toEqual({
      manifestPath: 'dist/manifest.json',
      expectedVersion: '1.2.3',
    });
  });

  it('should allow expected version without a manifest path', () => {
    expect(parseArgs(['--expected-version', '1.2.3'])).toEqual({
      manifestPath: null,
      expectedVersion: '1.2.3',
    });
  });

  it('should ignore unknown flags and keep positional manifest path', () => {
    expect(parseArgs(['dist/manifest.json', '--verbose'])).toEqual({
      manifestPath: 'dist/manifest.json',
      expectedVersion: null,
    });
  });
});

describe('validateLinkedInProfileImportPermissions', () => {
  it('should accept the actual manifest LinkedIn profile import permission model', () => {
    const manifest: unknown = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src/manifest.json'), 'utf-8')
    );
    const schemaResult = validateSchema(manifest);

    expect(schemaResult.success).toBe(true);
    if (schemaResult.success) {
      expect(validateLinkedInProfileImportPermissions(schemaResult.data)).toEqual({ valid: true });
    }
  });

  it('should reject manifests missing activeTab, scripting, or optional LinkedIn access', () => {
    const result = validateLinkedInProfileImportPermissions({
      permissions: ['storage'],
      optional_host_permissions: [],
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('"scripting"'),
          expect.stringContaining('"activeTab"'),
          expect.stringContaining('https://www.linkedin.com/*'),
        ])
      );
    }
  });
});

describe('host_permissions coverage', () => {
  /**
   * Reads the real src/manifest.json and verifies every registered
   * connector has at least one matching host_permission entry.
   * This guards against forgetting to add host_permissions when a
   * new connector is registered.
   */
  const realManifest: unknown = JSON.parse(
    readFileSync(resolve(process.cwd(), 'src/manifest.json'), 'utf-8')
  );
  const hostPermissions: string[] =
    (realManifest as { host_permissions?: string[] }).host_permissions ?? [];

  it('should include host_permissions for Malt (.fr)', () => {
    const hasMaltFr = hostPermissions.some((h) => h.includes('malt.fr'));
    expect(hasMaltFr).toBe(true);
  });

  it('should include host_permissions for Malt (.io)', () => {
    const hasMaltIo = hostPermissions.some((h) => h.includes('malt.io'));
    expect(hasMaltIo).toBe(true);
  });

  it('should include host_permissions for all registered connectors', () => {
    // Every connector meta URL must have at least one matching host_permission
    // so fetch/cookie requests don't silently fail in production.
    const connectorDomains: Array<{ name: string; domain: string }> = [
      { name: 'Free-Work', domain: 'free-work.com' },
      { name: 'LeHibou', domain: 'lehibou.com' },
      { name: 'Hiway', domain: 'hiway-missions.fr' },
      { name: 'Collective', domain: 'collective.work' },
      { name: 'Cherry Pick', domain: 'cherry-pick.io' },
      { name: 'Malt', domain: 'malt.fr' },
    ];

    for (const { name, domain } of connectorDomains) {
      const hasPermission = hostPermissions.some((h) => h.includes(domain));
      expect(hasPermission, `host_permissions missing entry for ${name} (${domain})`).toBe(true);
    }
  });
});

describe('validateVersionConsistency', () => {
  /**
   * OpenSpec scenario: Matching versions pass consistency check.
   * GIVEN package.json and manifest.json have the same version
   * WHEN checking consistency
   * THEN returns valid: true
   */
  it('should pass when package and manifest versions match', () => {
    const result = validateVersionConsistency('0.2.1', '0.2.1');
    expect(result).toEqual({ valid: true });
  });

  /**
   * OpenSpec scenario: Mismatched versions fail consistency check.
   * GIVEN package.json has 0.2.1 and manifest.json has 0.1.0
   * WHEN checking consistency
   * THEN returns valid: false with descriptive error
   */
  it('should fail when package version differs from manifest version', () => {
    const result = validateVersionConsistency('0.2.1', '0.1.0');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('0.2.1');
      expect(result.error).toContain('0.1.0');
    }
  });

  /**
   * OpenSpec scenario: Mismatch direction matters in error message.
   * GIVEN manifest is newer than package
   * WHEN checking consistency
   * THEN error message shows both versions correctly
   */
  it('should report mismatch when manifest is newer than package', () => {
    const result = validateVersionConsistency('0.1.0', '0.2.1');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('package.json has 0.1.0');
      expect(result.error).toContain('manifest.json has 0.2.1');
    }
  });

  /**
   * OpenSpec scenario: Prerelease versions compare correctly.
   * GIVEN both have "1.0.0-beta.1"
   * WHEN checking consistency
   * THEN passes (exact string match)
   */
  it('should pass when both versions are identical prerelease', () => {
    const result = validateVersionConsistency('1.0.0-beta.1', '1.0.0-beta.1');
    expect(result).toEqual({ valid: true });
  });

  /**
   * OpenSpec scenario: Prerelease mismatch is caught.
   */
  it('should fail when prerelease suffix differs', () => {
    const result = validateVersionConsistency('1.0.0-beta.1', '1.0.0-beta.2');
    expect(result.valid).toBe(false);
  });

  /**
   * OpenSpec scenario: Both at 0.0.0 passes.
   */
  it('should pass for zero version', () => {
    const result = validateVersionConsistency('0.0.0', '0.0.0');
    expect(result).toEqual({ valid: true });
  });

  /**
   * OpenSpec scenario: Empty string versions are treated as mismatch.
   * GIVEN one version is empty
   * WHEN checking consistency
   * THEN returns invalid
   */
  it('should fail when one version is empty string', () => {
    const result = validateVersionConsistency('0.2.1', '');
    expect(result.valid).toBe(false);
  });
});
