#!/usr/bin/env node
/**
 * verify-manifest.ts - Validate Chrome extension manifest.json
 *
 * Usage: tsx scripts/verify-manifest.ts [manifest-path] [--expected-version <semver>] [--post-build]
 *
 * Validates that manifest.json conforms to Chrome Extension Manifest V3
 * requirements and contains all required fields.
 *
 * Options:
 *   --expected-version <semver>  Fail if manifest version doesn't match (used in CI release)
 *   --post-build                 Run post-build checks on a filtered dist/manifest.json:
 *                                no unowned or excluded-connector patterns leak through,
 *                                and every shipped connector's declared host_permissions
 *                                is present.
 *                                Without it, runs the source-manifest full-catalog coverage
 *                                check instead.
 *
 * Exit codes:
 *   0 - Valid manifest
 *   1 - Invalid manifest, file not found, or version mismatch
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { getAllConnectorsMeta, ALL_CONNECTOR_IDS } from '../src/lib/shell/connectors/meta';
import { resolveIncludedConnectors, type ConnectorConfig } from './resolve-connectors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Pure validation schema - no side effects

const ManifestV3Schema = z.object({
  manifest_version: z.literal(3, {
    errorMap: () => ({ message: 'manifest_version must be 3 for Chrome MV3' }),
  }),
  name: z.string().min(1, 'name is required'),
  version: z.string().regex(/^\d+\.\d+\.\d+/, {
    message: 'version must be in format X.Y.Z',
  }),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  host_permissions: z.array(z.string()).optional(),
  optional_host_permissions: z.array(z.string()).optional(),
  background: z
    .object({
      service_worker: z.string(),
      type: z.enum(['module', 'classic']).optional(),
    })
    .optional(),
  action: z
    .object({
      default_title: z.string().optional(),
      default_icon: z.union([z.string(), z.record(z.string())]).optional(),
      default_popup: z.string().optional(),
    })
    .optional(),
  icons: z.record(z.string().regex(/^\d+$/), z.string()).optional(),
  side_panel: z
    .object({
      default_path: z.string(),
    })
    .optional(),
  content_scripts: z
    .array(
      z.object({
        matches: z.array(z.string()),
        js: z.array(z.string()).optional(),
        css: z.array(z.string()).optional(),
      })
    )
    .optional(),
  web_accessible_resources: z
    .array(
      z.object({
        resources: z.array(z.string()),
        matches: z.array(z.string()).optional(),
      })
    )
    .optional(),
});

type ManifestV3 = z.infer<typeof ManifestV3Schema>;

export const ALLOWED_INFRASTRUCTURE_HOST_PERMISSIONS = [
  'https://copilot.missionpulse.app/*',
] as const;

// Pure validation functions

/**
 * Validates manifest structure using Zod schema.
 */
export const validateSchema = (
  manifest: unknown
): { success: true; data: ManifestV3 } | { success: false; errors: string[] } => {
  const result = ManifestV3Schema.safeParse(manifest);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues.map(
    (issue) => `  - ${issue.path.join('.')}: ${issue.message}`
  );
  return { success: false, errors };
};

/**
 * Validates version consistency between package.json and manifest.json.
 */
export const validateVersionConsistency = (
  packageVersion: string,
  manifestVersion: string
): { valid: true } | { valid: false; error: string } => {
  if (packageVersion === manifestVersion) {
    return { valid: true };
  }
  return {
    valid: false,
    error: `Version mismatch: package.json has ${packageVersion}, manifest.json has ${manifestVersion}`,
  };
};

/**
 * Validates the least-privilege permissions required by the LinkedIn profile import flow.
 */
export const validateLinkedInProfileImportPermissions = (
  manifest: Pick<ManifestV3, 'permissions' | 'optional_host_permissions'>
): { valid: true } | { valid: false; errors: string[] } => {
  const permissions = new Set(manifest.permissions ?? []);
  const optionalHostPermissions = new Set(manifest.optional_host_permissions ?? []);
  const errors: string[] = [];

  if (!permissions.has('scripting')) {
    errors.push('permissions must include "scripting" for user-triggered LinkedIn DOM extraction');
  }

  if (!permissions.has('activeTab')) {
    errors.push('permissions must include "activeTab" for active LinkedIn profile imports');
  }

  if (!optionalHostPermissions.has('https://www.linkedin.com/*')) {
    errors.push(
      'optional_host_permissions must include "https://www.linkedin.com/*" for least-privilege LinkedIn access'
    );
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
};

/**
 * Extracts the registrable (last-two-label) domain from a connector URL,
 * e.g. `https://www.cherry-pick.io` → `cherry-pick.io`,
 * `https://app.collective.work/` → `collective.work`.
 */
export const registrableDomainOf = (url: string): string => {
  const hostname = new URL(url).hostname.replace(/^www\./, '');
  const parts = hostname.split('.');
  return parts.slice(-2).join('.');
};

export interface HostPermissionConnector {
  id: string;
  name: string;
  url: string;
  hostPermissions: readonly string[];
}

/**
 * Validates that every host_permission pattern declared by every connector in
 * `connectors` is present in the manifest. Checks each declared pattern
 * exactly (not a domain substring) so a connector owning several patterns
 * (e.g. Malt's `.fr` and `.io`) cannot pass when only one is present. Used on
 * the SOURCE manifest (which must cover the full catalog so any build subset
 * finds its patterns).
 */
export const validateHostPermissionCoverage = (
  manifest: Pick<ManifestV3, 'host_permissions'>,
  connectors: readonly HostPermissionConnector[]
): { valid: true } | { valid: false; errors: string[] } => {
  const manifestPatterns = new Set(manifest.host_permissions ?? []);
  const errors: string[] = [];

  for (const connector of connectors) {
    for (const pattern of connector.hostPermissions) {
      if (!manifestPatterns.has(pattern)) {
        errors.push(`host_permissions missing pattern "${pattern}" for ${connector.name}`);
      }
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
};

/**
 * Validates least-privilege: every mandatory host_permission must be owned by
 * exactly one catalogued connector and that connector must belong to
 * `shippedConnectors`. Use with the full catalog for the source manifest and
 * with the resolved subset for a filtered build output.
 */
export const validateNoExcludedConnectorPatterns = (
  manifest: Pick<ManifestV3, 'host_permissions'>,
  allConnectors: readonly HostPermissionConnector[],
  shippedConnectors: readonly HostPermissionConnector[],
  allowedInfrastructurePatterns: readonly string[] = []
): { valid: true } | { valid: false; errors: string[] } => {
  const hostPermissions = manifest.host_permissions ?? [];
  const shippedConnectorIds = new Set(shippedConnectors.map(({ id }) => id));
  const ownersByPattern = new Map<string, HostPermissionConnector[]>();
  for (const connector of allConnectors) {
    for (const pattern of connector.hostPermissions) {
      const owners = ownersByPattern.get(pattern) ?? [];
      owners.push(connector);
      ownersByPattern.set(pattern, owners);
    }
  }
  const errors: string[] = [];
  const allowedInfrastructure = new Set(allowedInfrastructurePatterns);

  for (const pattern of hostPermissions) {
    if (allowedInfrastructure.has(pattern)) {
      continue;
    }
    const owners = ownersByPattern.get(pattern) ?? [];
    if (owners.length === 0) {
      errors.push(
        `host_permission "${pattern}" has no connector ownership claim — least-privilege violation`
      );
      continue;
    }
    if (owners.length !== 1) {
      errors.push(
        `host_permission "${pattern}" must have exactly one connector ownership claim; found ${owners.length}: ${owners
          .map(({ name }) => name)
          .join(', ')}`
      );
      continue;
    }
    if (shippedConnectorIds.has(owners[0].id)) {
      continue;
    }
    errors.push(
      `host_permission "${pattern}" is owned by excluded connector ${owners[0].name} — least-privilege violation`
    );
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
};

// Pure argument parsing — no side effects

export const parseArgs = (
  rawArgs: string[]
): { manifestPath: string | null; expectedVersion: string | null; postBuild: boolean } => {
  let manifestPath: string | null = null;
  let expectedVersion: string | null = null;
  let postBuild = false;

  const args = [...rawArgs];
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === undefined) {
      break;
    }

    if (arg === '--expected-version') {
      const value = args.shift();
      if (value !== undefined) {
        expectedVersion = value;
      }
    } else if (arg === '--post-build') {
      postBuild = true;
    } else if (!arg.startsWith('--')) {
      manifestPath = arg;
    }
  }

  return { manifestPath, expectedVersion, postBuild };
};

// Main function

export const main = (): void => {
  const {
    manifestPath: manifestPathArg,
    expectedVersion,
    postBuild,
  } = parseArgs(process.argv.slice(2));
  const projectRoot = resolve(__dirname, '..');

  const manifestPath = manifestPathArg
    ? resolve(manifestPathArg)
    : resolve(projectRoot, 'src/manifest.json');
  const packageJsonPath = resolve(projectRoot, 'package.json');

  console.log(`Verifying manifest: ${manifestPath}\n`);

  // Check file exists
  if (!existsSync(manifestPath)) {
    console.error(`Error: manifest.json not found at ${manifestPath}`);
    process.exit(1);
  }

  // Read and parse manifest
  let manifest: unknown;

  try {
    const manifestContent = readFileSync(manifestPath, 'utf-8');
    manifest = JSON.parse(manifestContent);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error(`Error: Could not read or parse manifest file`);
    }
    process.exit(1);
  }

  // Validate schema
  const schemaResult = validateSchema(manifest);

  if (!schemaResult.success) {
    console.error('❌ Manifest validation failed:\n');
    schemaResult.errors.forEach((error) => console.error(error));
    process.exit(1);
  }

  console.log('✅ Schema validation passed');

  const linkedInPermissionsResult = validateLinkedInProfileImportPermissions(schemaResult.data);
  if (!linkedInPermissionsResult.valid) {
    console.error('❌ LinkedIn profile import permissions validation failed:\n');
    linkedInPermissionsResult.errors.forEach((error) => console.error(`  - ${error}`));
    process.exit(1);
  }

  console.log('✅ LinkedIn profile import permissions check passed');

  // Validate version against expected version (CI release gate)
  if (expectedVersion !== null) {
    if (schemaResult.data.version !== expectedVersion) {
      console.error(
        `❌ Version mismatch: manifest has ${schemaResult.data.version}, expected ${expectedVersion}`
      );
      process.exit(1);
    }
    console.log(`✅ Version matches expected: ${expectedVersion}`);
  }

  // Validate version consistency with package.json
  if (existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const versionResult = validateVersionConsistency(
      packageJson.version,
      schemaResult.data.version
    );

    if (!versionResult.valid) {
      console.error(`❌ Error: ${versionResult.error}`);
      process.exit(1);
    } else {
      console.log('✅ Version consistency check passed');
    }
  }

  // Connector host_permission checks. The catalog is the single source of
  // truth for which patterns each connector owns (see meta.ts).
  const allConnectors: HostPermissionConnector[] = getAllConnectorsMeta().map((c) => ({
    id: c.id,
    name: c.name,
    url: c.url,
    hostPermissions: c.hostPermissions,
  }));

  if (postBuild) {
    // Post-build (dist/manifest.json): enforce least-privilege. No unowned
    // pattern or pattern owned by an excluded connector may survive the
    // filter, and every shipped connector pattern must be present.
    const configPath = resolve(projectRoot, 'connectors.config.json');
    const connectorConfig: ConnectorConfig = existsSync(configPath)
      ? (() => {
          try {
            return JSON.parse(readFileSync(configPath, 'utf-8')) as ConnectorConfig;
          } catch {
            return {};
          }
        })()
      : {};
    const resolution = resolveIncludedConnectors({
      allIds: [...ALL_CONNECTOR_IDS],
      config: connectorConfig,
      env: process.env,
    });
    const shippedIds = new Set(resolution.included);
    const shippedConnectors = allConnectors.filter((c) => shippedIds.has(c.id));

    const excludedResult = validateNoExcludedConnectorPatterns(
      schemaResult.data,
      allConnectors,
      shippedConnectors,
      ALLOWED_INFRASTRUCTURE_HOST_PERMISSIONS
    );
    if (!excludedResult.valid) {
      console.error('❌ Unowned or excluded host patterns leaked into built manifest:\n');
      excludedResult.errors.forEach((error) => console.error(`  - ${error}`));
      process.exit(1);
    }
    console.log('✅ No excluded connector patterns in built manifest');

    const shippedCoverageResult = validateHostPermissionCoverage(
      schemaResult.data,
      shippedConnectors
    );
    if (!shippedCoverageResult.valid) {
      console.error('❌ Built manifest missing shipped connector host_permissions:\n');
      shippedCoverageResult.errors.forEach((error) => console.error(`  - ${error}`));
      process.exit(1);
    }
    console.log('✅ Shipped connector host_permissions coverage check passed');
  } else {
    // Source manifest (src/manifest.json): must cover the FULL catalog so any
    // build subset can find its patterns, and may not contain an unowned host.
    const ownershipResult = validateNoExcludedConnectorPatterns(
      schemaResult.data,
      allConnectors,
      allConnectors,
      ALLOWED_INFRASTRUCTURE_HOST_PERMISSIONS
    );
    if (!ownershipResult.valid) {
      console.error('❌ Source manifest contains unowned host_permissions:\n');
      ownershipResult.errors.forEach((error) => console.error(`  - ${error}`));
      process.exit(1);
    }
    console.log('✅ Source host_permissions ownership check passed');

    const coverageResult = validateHostPermissionCoverage(schemaResult.data, allConnectors);
    if (!coverageResult.valid) {
      console.error('❌ Source manifest missing connector host_permissions:\n');
      coverageResult.errors.forEach((error) => console.error(`  - ${error}`));
      process.exit(1);
    }
    console.log('✅ Connector host_permissions coverage check passed');
  }

  // Summary
  const { data } = schemaResult;

  console.log('\n📋 Manifest Summary:');
  console.log(`   Name:            ${data.name}`);
  console.log(`   Version:         ${data.version}`);
  console.log(`   Manifest Version: ${data.manifest_version}`);
  console.log(`   Permissions:     ${data.permissions?.join(', ') || 'none'}`);
  console.log(`   Host Permissions: ${data.host_permissions?.length || 0} patterns`);
  console.log(
    `   Optional Host Permissions: ${data.optional_host_permissions?.length || 0} patterns`
  );
  console.log(`   Service Worker:  ${data.background?.service_worker || 'none'}`);

  console.log('\n✅ Manifest is valid for Chrome Extension MV3\n');
};

const isExecutedDirectly = (): boolean => {
  const entryPoint = process.argv[1];
  return entryPoint ? resolve(entryPoint) === __filename : false;
};

if (isExecutedDirectly()) {
  main();
}
