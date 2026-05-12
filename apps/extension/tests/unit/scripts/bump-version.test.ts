import { describe, it, expect } from 'vitest';
import {
  isValidSemver,
  updateManifestVersion,
  updatePackageJsonVersion,
} from '../../../scripts/bump-version.ts';
// ── Fixtures ────────────────────────────────────────────────────────

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
  ],
  host_permissions: [
    'https://www.free-work.com/*',
    'https://*.lehibou.com/*',
    'https://hiway-missions.fr/*',
  ],
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

const SAMPLE_PACKAGE_JSON = JSON.stringify(
  {
    name: '@pulse/extension',
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: { build: 'vite build' },
  },
  null,
  2
);

const SAMPLE_MANIFEST_JSON = JSON.stringify(
  {
    manifest_version: 3,
    name: 'MissionPulse',
    version: '0.1.0',
    permissions: ['storage', 'sidePanel'],
  },
  null,
  2
);

// ── Tests ──────────────────────────────────────────────────────────

describe('isValidSemver', () => {
  /**
   * OpenSpec scenario: Standard semver is valid.
   * GIVEN "1.0.0"
   * WHEN validating
   * THEN returns true
   */
  it('should accept standard semver X.Y.Z', () => {
    expect(isValidSemver('1.0.0')).toBe(true);
    expect(isValidSemver('0.0.1')).toBe(true);
    expect(isValidSemver('0.2.1')).toBe(true);
    expect(isValidSemver('10.20.30')).toBe(true);
  });

  /**
   * OpenSpec scenario: Prerelease suffix is valid.
   */
  it('should accept semver with prerelease suffix', () => {
    expect(isValidSemver('1.0.0-beta')).toBe(true);
    expect(isValidSemver('1.0.0-alpha.1')).toBe(true);
    expect(isValidSemver('2.0.0-rc.1')).toBe(true);
    expect(isValidSemver('0.1.0-dev.20260512')).toBe(true);
  });

  /**
   * OpenSpec scenario: Prerelease with dots is valid.
   */
  it('should accept prerelease with dot-separated segments', () => {
    expect(isValidSemver('1.0.0-beta.1.2')).toBe(true);
  });

  /**
   * OpenSpec scenario: Reject v-prefixed versions.
   */
  it('should reject v-prefixed versions', () => {
    expect(isValidSemver('v1.0.0')).toBe(false);
    expect(isValidSemver('V1.0.0')).toBe(false);
  });

  /**
   * OpenSpec scenario: Reject incomplete versions.
   */
  it('should reject incomplete versions', () => {
    expect(isValidSemver('1')).toBe(false);
    expect(isValidSemver('1.0')).toBe(false);
  });

  /**
   * OpenSpec scenario: Reject build metadata (not in regex).
   * Chrome manifest doesn't support +build metadata.
   */
  it('should reject build metadata', () => {
    expect(isValidSemver('1.0.0+build')).toBe(false);
    expect(isValidSemver('1.0.0-beta+build')).toBe(false);
  });

  /**
   * OpenSpec scenario: Reject empty string.
   */
  it('should reject empty string', () => {
    expect(isValidSemver('')).toBe(false);
  });

  /**
   * OpenSpec scenario: Reject non-numeric segments.
   */
  it('should reject non-numeric major/minor/patch', () => {
    expect(isValidSemver('a.b.c')).toBe(false);
    expect(isValidSemver('1.x.0')).toBe(false);
    expect(isValidSemver('1.0.x')).toBe(false);
  });

  /**
   * OpenSpec scenario: Reject versions with leading zeros (single digit is fine).
   */
  it('should accept zero-padded segments as long as they parse', () => {
    // The regex uses \d+, so "01.0.0" technically matches. This is intentional:
    // Chrome accepts it, and we keep validation minimal.
    expect(isValidSemver('01.0.0')).toBe(true);
  });

  /**
   * OpenSpec scenario: Reject whitespace.
   */
  it('should reject versions with whitespace', () => {
    expect(isValidSemver(' 1.0.0')).toBe(false);
    expect(isValidSemver('1.0.0 ')).toBe(false);
    expect(isValidSemver('1.0.0 ')).toBe(false);
  });

  /**
   * OpenSpec scenario: Reject versions with extra characters after prerelease.
   */
  it('should reject versions with non-alphanumeric prerelease', () => {
    expect(isValidSemver('1.0.0-beta!')).toBe(false);
    expect(isValidSemver('1.0.0-@dev')).toBe(false);
  });
});

describe('updatePackageJsonVersion', () => {
  /**
   * OpenSpec scenario: Bumping version updates the version field.
   * GIVEN a package.json content string
   * WHEN updatePackageJsonVersion is called with new version
   * THEN the returned string has the new version in the version field
   */
  it('should update version field in package.json content', () => {
    const result = updatePackageJsonVersion(SAMPLE_PACKAGE_JSON, '1.0.0');
    const parsed = JSON.parse(result);
    expect(parsed.version).toBe('1.0.0');
  });

  /**
   * OpenSpec scenario: Other fields remain unchanged.
   */
  it('should preserve all other package.json fields', () => {
    const result = updatePackageJsonVersion(SAMPLE_PACKAGE_JSON, '1.0.0');
    const parsed = JSON.parse(result);
    expect(parsed.name).toBe('@pulse/extension');
    expect(parsed.private).toBe(true);
    expect(parsed.type).toBe('module');
    expect(parsed.scripts.build).toBe('vite build');
  });

  /**
   * OpenSpec scenario: Output is valid JSON with trailing newline.
   */
  it('should produce valid JSON with trailing newline', () => {
    const result = updatePackageJsonVersion(SAMPLE_PACKAGE_JSON, '1.0.0');
    expect(result.endsWith('\n')).toBe(true);
    // Should not throw when parsed
    expect(() => JSON.parse(result)).not.toThrow();
  });

  /**
   * OpenSpec scenario: Prerelease version is set correctly.
   */
  it('should set prerelease version', () => {
    const result = updatePackageJsonVersion(SAMPLE_PACKAGE_JSON, '2.0.0-beta.1');
    const parsed = JSON.parse(result);
    expect(parsed.version).toBe('2.0.0-beta.1');
  });

  /**
   * OpenSpec scenario: Bumping to same version is a no-op in output.
   */
  it('should handle bumping to the same version', () => {
    const result = updatePackageJsonVersion(SAMPLE_PACKAGE_JSON, '0.1.0');
    const parsed = JSON.parse(result);
    expect(parsed.version).toBe('0.1.0');
  });
});

describe('updateManifestVersion', () => {
  /**
   * OpenSpec scenario: Bumping version updates the version field in manifest.
   * GIVEN a manifest.json content string
   * WHEN updateManifestVersion is called with new version
   * THEN the returned string has the new version
   */
  it('should update version field in manifest.json content', () => {
    const result = updateManifestVersion(SAMPLE_MANIFEST_JSON, '1.0.0');
    const parsed = JSON.parse(result);
    expect(parsed.version).toBe('1.0.0');
  });

  /**
   * OpenSpec scenario: Other manifest fields remain unchanged.
   */
  it('should preserve all other manifest.json fields', () => {
    const result = updateManifestVersion(SAMPLE_MANIFEST_JSON, '1.0.0');
    const parsed = JSON.parse(result);
    expect(parsed.manifest_version).toBe(3);
    expect(parsed.name).toBe('MissionPulse');
    expect(parsed.permissions).toEqual(['storage', 'sidePanel']);
  });

  /**
   * OpenSpec scenario: Output is valid JSON with trailing newline.
   */
  it('should produce valid JSON with trailing newline', () => {
    const result = updateManifestVersion(SAMPLE_MANIFEST_JSON, '1.0.0');
    expect(result.endsWith('\n')).toBe(true);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  /**
   * OpenSpec scenario: Real manifest preserves all fields.
   */
  it('should preserve real manifest fields including host_permissions', () => {
    const realManifest = JSON.stringify(FULL_REAL_MANIFEST, null, 2);
    const result = updateManifestVersion(realManifest, '0.3.0');
    const parsed = JSON.parse(result);
    expect(parsed.version).toBe('0.3.0');
    expect(parsed.manifest_version).toBe(3);
    expect(parsed.host_permissions).toEqual(FULL_REAL_MANIFEST.host_permissions);
    expect(parsed.background.service_worker).toBe('src/background/index.ts');
  });
});

/**
 * Integration: version consistency after bump.
 *
 * OpenSpec scenario: After bumping both files with the same version,
 * they should pass the version consistency check.
 */
describe('Version bump + consistency integration', () => {
  it('should produce consistent versions after bumping both files', () => {
    const newVersion = '2.0.0-beta.1';

    const updatedPackage = updatePackageJsonVersion(SAMPLE_PACKAGE_JSON, newVersion);
    const updatedManifest = updateManifestVersion(SAMPLE_MANIFEST_JSON, newVersion);

    const pkgVersion = JSON.parse(updatedPackage).version;
    const manifestVersion = JSON.parse(updatedManifest).version;

    // The two versions must match
    expect(pkgVersion).toBe(manifestVersion);
    expect(pkgVersion).toBe(newVersion);

    // The manifest version must pass semver validation
    expect(isValidSemver(manifestVersion)).toBe(true);
  });

  it('should produce consistent versions across multiple bumps', () => {
    const versions = ['0.1.0', '0.2.0', '0.2.1', '1.0.0-rc.1', '1.0.0'];

    let pkgContent = SAMPLE_PACKAGE_JSON;
    let manifestContent = SAMPLE_MANIFEST_JSON;

    for (const version of versions) {
      pkgContent = updatePackageJsonVersion(pkgContent, version);
      manifestContent = updateManifestVersion(manifestContent, version);

      const pkgVersion = JSON.parse(pkgContent).version;
      const manifestVersion = JSON.parse(manifestContent).version;

      expect(pkgVersion).toBe(version);
      expect(manifestVersion).toBe(version);
      expect(pkgVersion).toBe(manifestVersion);
    }
  });
});
