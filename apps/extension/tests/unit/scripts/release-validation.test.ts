import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import { isValidSemver } from '../../../scripts/bump-version.ts';
import { validateSchema, validateVersionConsistency } from '../../../scripts/verify-manifest.ts';

/**
 * Release integration tests — validate actual project files on disk.
 *
 * These tests run as part of CI to catch:
 * - Manifest not found or unparseable
 * - Package.json version mismatch with manifest
 * - Missing required manifest fields for Chrome Web Store submission
 *
 * These are NOT unit tests — they validate the actual project state.
 * They are safe for CI because they are read-only.
 *
 * OpenSpec scenario: Pre-release validation gate.
 * GIVEN the current project files on disk
 * WHEN CI runs before release
 * THEN manifest is valid, versions are consistent, required fields exist
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXTENSION_ROOT = resolve(__dirname, '..', '..', '..');
const WORKSPACE_ROOT = resolve(EXTENSION_ROOT, '..', '..');

const MANIFEST_PATH = resolve(EXTENSION_ROOT, 'src/manifest.json');
const PACKAGE_JSON_PATH = resolve(EXTENSION_ROOT, 'package.json');
const ROOT_PACKAGE_JSON_PATH = resolve(WORKSPACE_ROOT, 'package.json');
const RELEASE_WORKFLOW_PATH = resolve(WORKSPACE_ROOT, '.github/workflows/release.yml');

type ReleaseWorkflowStep = {
  name?: string;
  run?: string;
  env?: Record<string, string>;
};

type DeployPreflightModule = {
  createManifestValidationCommand?: (expectedVersion: string) => {
    command: string;
    args: string[];
  };
  evaluateRuntimeEnvironment?: (
    environment: Record<string, string | undefined>,
    mode: 'production' | 'inspection'
  ) => {
    missing: string[];
    exitCode: 0 | 1;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readReleaseWorkflowSteps = (): ReleaseWorkflowStep[] => {
  const workflow: unknown = parseYaml(readFileSync(RELEASE_WORKFLOW_PATH, 'utf-8'));
  if (!isRecord(workflow) || !isRecord(workflow.jobs)) {
    throw new Error('release.yml must define jobs');
  }

  const buildJob = workflow.jobs['build-and-release'];
  if (!isRecord(buildJob) || !Array.isArray(buildJob.steps)) {
    throw new Error('release.yml must define build-and-release steps');
  }

  return buildJob.steps.filter(isRecord).map((step) => ({
    name: typeof step.name === 'string' ? step.name : undefined,
    run: typeof step.run === 'string' ? step.run : undefined,
    env:
      isRecord(step.env) && Object.values(step.env).every((value) => typeof value === 'string')
        ? (step.env as Record<string, string>)
        : undefined,
  }));
};

const loadDeployPreflight = async (): Promise<DeployPreflightModule> =>
  (await import('../../../../../scripts/deploy-preflight.mjs')) as DeployPreflightModule;

describe('Release validation — actual project files', () => {
  /**
   * OpenSpec scenario: manifest.json exists and is parseable.
   * GIVEN the project is checked out
   * WHEN reading src/manifest.json
   * THEN it exists and contains valid JSON
   */
  it('should have a parseable manifest.json', () => {
    const content = readFileSync(MANIFEST_PATH, 'utf-8');
    expect(() => JSON.parse(content)).not.toThrow();
  });

  /**
   * OpenSpec scenario: package.json exists and is parseable.
   */
  it('should have a parseable package.json', () => {
    const content = readFileSync(PACKAGE_JSON_PATH, 'utf-8');
    expect(() => JSON.parse(content)).not.toThrow();
  });

  /**
   * OpenSpec scenario: Manifest declares MV3.
   * GIVEN manifest.json
   * WHEN reading manifest_version
   * THEN it is exactly 3
   */
  it('should declare manifest_version 3', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    expect(manifest.manifest_version).toBe(3);
  });

  it('should pass the shared manifest schema validation', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    const result = validateSchema(manifest);

    expect(result.success).toBe(true);
  });

  /**
   * OpenSpec scenario: Manifest has a valid semver version.
   */
  it('should have a valid semver version in manifest', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    expect(isValidSemver(manifest.version)).toBe(true);
  });

  /**
   * OpenSpec scenario: Manifest has a non-empty name.
   */
  it('should have a non-empty name', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    expect(typeof manifest.name).toBe('string');
    expect(manifest.name.length).toBeGreaterThan(0);
  });

  /**
   * OpenSpec scenario: Manifest declares a background service_worker.
   * Chrome Web Store requires this for MV3 extensions.
   */
  it('should declare a background service_worker', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    expect(manifest.background).toBeDefined();
    expect(typeof manifest.background.service_worker).toBe('string');
    expect(manifest.background.service_worker.length).toBeGreaterThan(0);
  });

  /**
   * OpenSpec scenario: Manifest has side_panel path.
   * MissionPulse uses side_panel as its primary UI.
   */
  it('should declare side_panel default_path', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    expect(manifest.side_panel).toBeDefined();
    expect(typeof manifest.side_panel.default_path).toBe('string');
  });

  /**
   * OpenSpec scenario: Manifest has icons for Chrome Web Store.
   * CWS requires at minimum 128x128 icon.
   */
  it('should declare icons including 128x128', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    expect(manifest.icons).toBeDefined();
    expect(manifest.icons['128']).toBeDefined();
  });

  /**
   * OpenSpec scenario: Permissions is an array.
   */
  it('should have permissions as an array', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    expect(Array.isArray(manifest.permissions)).toBe(true);
  });

  /**
   * OpenSpec scenario: sidePanel permission is declared.
   * Required for the side_panel API to work.
   */
  it('should declare sidePanel permission', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    expect(manifest.permissions).toContain('sidePanel');
  });

  /**
   * OpenSpec scenario: Storage permission is declared.
   * MissionPulse requires storage for IndexedDB and chrome.storage.
   */
  it('should declare storage permission', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    expect(manifest.permissions).toContain('storage');
  });

  /**
   * CRITICAL: Version consistency between package.json and manifest.json.
   *
   * OpenSpec scenario: Versions must match for safe release.
   * GIVEN package.json and manifest.json on disk
   * WHEN comparing their version fields
   * THEN they should match (release workflow bumps both)
   *
   * NOTE: This test may fail in development when versions are out of sync.
   * That's intentional — it catches the exact bug that the release workflow
   * is designed to prevent.
   */
  it('should have matching versions in root package.json, extension package.json, and manifest.json', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8'));
    const rootPackageJson = JSON.parse(readFileSync(ROOT_PACKAGE_JSON_PATH, 'utf-8'));

    expect(validateVersionConsistency(packageJson.version, manifest.version)).toEqual({
      valid: true,
    });
    expect(validateVersionConsistency(rootPackageJson.version, manifest.version)).toEqual({
      valid: true,
    });
    expect(rootPackageJson.version).toBe(
      packageJson.version,
      `Version mismatch: root package.json has ${rootPackageJson.version}, extension package.json has ${packageJson.version}. Run: pnpm --filter @pulse/extension bump-version <version>`
    );
  });

  /**
   * OpenSpec scenario: Package.json has correct name.
   */
  it('should have correct package name', () => {
    const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8'));
    expect(packageJson.name).toBe('@pulse/extension');
  });

  /**
   * OpenSpec scenario: Manifest has no disallowed fields for CWS.
   * Chrome Web Store rejects manifests with certain fields.
   * This catches accidental inclusion of dev-only fields.
   */
  it('should not contain dev-only keys that would break CWS submission', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    const disallowedKeys = ['key', 'update_url', 'content_security_policy'];
    for (const key of disallowedKeys) {
      expect(manifest).not.toHaveProperty(key);
    }
  });
});

describe('Release validation — fail-closed artifact contracts', () => {
  it('validates the built manifest with post-build rules and the workflow release version', () => {
    const manifestStep = readReleaseWorkflowSteps().find(
      (step) => step.name === 'Verify built manifest version matches release version'
    );

    expect(manifestStep).toBeDefined();
    expect(manifestStep?.env).toEqual({
      EXPECTED_VERSION: '${{ steps.version.outputs.version }}',
    });
    expect(manifestStep?.run?.trim()).toBe(
      'pnpm --filter @pulse/extension verify-manifest dist/manifest.json --post-build --expected-version "$EXPECTED_VERSION"'
    );
  });

  it('builds the deploy preflight manifest command from exact structured metadata', async () => {
    const { createManifestValidationCommand } = await loadDeployPreflight();

    expect(createManifestValidationCommand).toBeTypeOf('function');
    if (typeof createManifestValidationCommand !== 'function') {
      return;
    }

    expect(createManifestValidationCommand('1.2.3')).toEqual({
      command: 'pnpm',
      args: [
        '--filter',
        '@pulse/extension',
        'verify-manifest',
        'dist/manifest.json',
        '--post-build',
        '--expected-version',
        '1.2.3',
      ],
    });
  });

  it('accumulates every missing required variable and fails production preflight', async () => {
    const { evaluateRuntimeEnvironment } = await loadDeployPreflight();

    expect(evaluateRuntimeEnvironment).toBeTypeOf('function');
    if (typeof evaluateRuntimeEnvironment !== 'function') {
      return;
    }

    expect(evaluateRuntimeEnvironment({}, 'production')).toEqual({
      missing: [
        'landing: PUBLIC_SUPABASE_URL',
        'landing: PUBLIC_SUPABASE_ANON_KEY',
        'landing: PUBLIC_LANDING_URL',
        'landing: SUPABASE_SERVICE_ROLE_KEY',
        'dashboard: PUBLIC_SUPABASE_URL',
        'dashboard: PUBLIC_SUPABASE_ANON_KEY',
        'dashboard: PUBLIC_LANDING_URL',
      ],
      exitCode: 1,
    });
  });

  it('keeps missing required variables non-blocking only in explicit inspection mode', async () => {
    const { evaluateRuntimeEnvironment } = await loadDeployPreflight();

    expect(evaluateRuntimeEnvironment).toBeTypeOf('function');
    if (typeof evaluateRuntimeEnvironment !== 'function') {
      return;
    }

    expect(evaluateRuntimeEnvironment({}, 'inspection')).toMatchObject({
      missing: expect.any(Array),
      exitCode: 0,
    });
  });
});
