#!/usr/bin/env node
/**
 * verify-manifest.ts - Validate Chrome extension manifest.json
 *
 * Usage: tsx scripts/verify-manifest.ts [manifest-path] [--expected-version <semver>]
 *
 * Validates that manifest.json conforms to Chrome Extension Manifest V3
 * requirements and contains all required fields.
 *
 * Options:
 *   --expected-version <semver>  Fail if manifest version doesn't match (used in CI release)
 *
 * Exit codes:
 *   0 - Valid manifest
 *   1 - Invalid manifest, file not found, or version mismatch
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

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
}

/**
 * Validates that every connector in `connectors` has at least one matching
 * host_permission entry in the manifest. Guards against forgetting to add
 * host_permissions when a connector is registered. Used on the SOURCE manifest
 * (which must cover the full catalog so any build subset finds its patterns).
 */
export const validateHostPermissionCoverage = (
  manifest: Pick<ManifestV3, 'host_permissions'>,
  connectors: readonly HostPermissionConnector[]
): { valid: true } | { valid: false; errors: string[] } => {
  const hostPermissions = manifest.host_permissions ?? [];
  const errors: string[] = [];

  for (const connector of connectors) {
    const domain = registrableDomainOf(connector.url);
    const hasPermission = hostPermissions.some((h) => h.includes(domain));
    if (!hasPermission) {
      errors.push(`host_permissions missing entry for ${connector.name} (${domain})`);
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
};

/**
 * Validates least-privilege: no host_permission pattern in the manifest is
 * owned by a connector NOT in `shippedConnectors`. Use on a FILTERED build
 * output (dist/manifest.json) to confirm excluded connectors left no patterns
 * behind. Patterns not owned by ANY connector in `allConnectors` (infra like
 * Supabase) are always allowed.
 */
export const validateNoExcludedConnectorPatterns = (
  manifest: Pick<ManifestV3, 'host_permissions'>,
  allConnectors: readonly (HostPermissionConnector & {
    hostPermissions: readonly string[];
  })[],
  shippedConnectors: readonly (HostPermissionConnector & {
    hostPermissions: readonly string[];
  })[]
): { valid: true } | { valid: false; errors: string[] } => {
  const hostPermissions = manifest.host_permissions ?? [];
  const shippedPatterns = new Set<string>(shippedConnectors.flatMap((c) => c.hostPermissions));
  const allOwnedPatterns = new Set<string>(allConnectors.flatMap((c) => c.hostPermissions));
  const errors: string[] = [];

  for (const pattern of hostPermissions) {
    // Pattern not owned by any connector (infra) — always fine.
    if (!allOwnedPatterns.has(pattern)) {
      continue;
    }
    // Owned by a shipped connector — fine.
    if (shippedPatterns.has(pattern)) {
      continue;
    }
    // Owned by a connector, but that connector is not shipped — leak.
    errors.push(
      `host_permission "${pattern}" is owned by an excluded connector — least-privilege violation`
    );
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
};

// Pure argument parsing — no side effects

export const parseArgs = (
  rawArgs: string[]
): { manifestPath: string | null; expectedVersion: string | null } => {
  let manifestPath: string | null = null;
  let expectedVersion: string | null = null;

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
    } else if (!arg.startsWith('--')) {
      manifestPath = arg;
    }
  }

  return { manifestPath, expectedVersion };
};

// Main function

export const main = (): void => {
  const { manifestPath: manifestPathArg, expectedVersion } = parseArgs(process.argv.slice(2));
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
