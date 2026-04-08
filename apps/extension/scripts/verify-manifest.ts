#!/usr/bin/env node
/**
 * verify-manifest.ts - Validate Chrome extension manifest.json
 *
 * Usage: tsx scripts/verify-manifest.ts [manifest-path]
 *
 * Validates that manifest.json conforms to Chrome Extension Manifest V3
 * requirements and contains all required fields.
 *
 * Exit codes:
 *   0 - Valid manifest
 *   1 - Invalid manifest or file not found
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
const validateSchema = (
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
const validateVersionConsistency = (
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

// Main function

const main = (): void => {
  const args = process.argv.slice(2);
  const projectRoot = resolve(__dirname, '..');

  const manifestPath = args[0] ? resolve(args[0]) : resolve(projectRoot, 'src/manifest.json');
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

  // Validate version consistency
  if (existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const versionResult = validateVersionConsistency(
      packageJson.version,
      schemaResult.data.version
    );

    if (!versionResult.valid) {
      console.warn(`⚠️  Warning: ${versionResult.error}`);
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
  console.log(`   Service Worker:  ${data.background?.service_worker || 'none'}`);

  console.log('\n✅ Manifest is valid for Chrome Extension MV3\n');
};

main();
