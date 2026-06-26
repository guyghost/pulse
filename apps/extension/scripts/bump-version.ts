#!/usr/bin/env node
/**
 * bump-version.ts - Bump version in package.json and manifest.json
 *
 * Usage: tsx scripts/bump-version.ts <version>
 *
 * This script updates the version field in root package.json, extension
 * package.json, and src/manifest.json to ensure consistency across the project.
 *
 * The version is injected as a pure string - no validation or
 * transformation is performed beyond basic format checking.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve monorepo root (two levels up from scripts/)
const MONOREPO_ROOT = resolve(__dirname, '../../..');

// Pure functions - no I/O

/**
 * Validates a semantic version string.
 * Accepts: X.Y.Z or X.Y.Z-prerelease
 */
export const isValidSemver = (version: string): boolean => {
  const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;
  return semverRegex.test(version);
};

/**
 * Updates version in package.json content.
 */
export const updatePackageJsonVersion = (content: string, version: string): string => {
  const parsed = JSON.parse(content);
  parsed.version = version;
  return JSON.stringify(parsed, null, 2) + '\n';
};

/**
 * Updates version in manifest.json content.
 */
export const updateManifestVersion = (content: string, version: string): string => {
  const parsed = JSON.parse(content);
  parsed.version = version;
  return JSON.stringify(parsed, null, 2) + '\n';
};

// Main function

export const main = (): void => {
  const args = process.argv.slice(2);

  if (args.length !== 1) {
    console.error('Usage: tsx scripts/bump-version.ts <version>');
    console.error('Example: tsx scripts/bump-version.ts 1.0.0');
    process.exit(1);
  }

  const version = args[0];

  if (!isValidSemver(version)) {
    console.error(`Error: Invalid semantic version: ${version}`);
    console.error('Expected format: X.Y.Z or X.Y.Z-prerelease');
    process.exit(1);
  }

  const projectRoot = resolve(__dirname, '..');
  const rootPackageJsonPath = resolve(MONOREPO_ROOT, 'package.json');
  const extPackageJsonPath = resolve(projectRoot, 'package.json');
  const manifestJsonPath = resolve(projectRoot, 'src/manifest.json');

  // Read current content
  const rootPackageContent = readFileSync(rootPackageJsonPath, 'utf-8');
  const extPackageContent = readFileSync(extPackageJsonPath, 'utf-8');
  const manifestContent = readFileSync(manifestJsonPath, 'utf-8');

  // Parse for display
  const currentRootVersion = JSON.parse(rootPackageContent).version;
  const currentExtVersion = JSON.parse(extPackageContent).version;
  const currentManifestVersion = JSON.parse(manifestContent).version;

  console.log(`Bumping version:`);
  console.log(`  root package.json:   ${currentRootVersion} → ${version}`);
  console.log(`  ext package.json:    ${currentExtVersion} → ${version}`);
  console.log(`  ext manifest.json:   ${currentManifestVersion} → ${version}`);

  // Write updated content
  writeFileSync(
    rootPackageJsonPath,
    updatePackageJsonVersion(rootPackageContent, version),
    'utf-8'
  );
  writeFileSync(extPackageJsonPath, updatePackageJsonVersion(extPackageContent, version), 'utf-8');
  writeFileSync(manifestJsonPath, updateManifestVersion(manifestContent, version), 'utf-8');

  console.log(`\n✅ Version bumped to ${version}`);
};

const isExecutedDirectly = (): boolean => {
  const entryPoint = process.argv[1];
  return entryPoint ? resolve(entryPoint) === __filename : false;
};

if (isExecutedDirectly()) {
  main();
}
