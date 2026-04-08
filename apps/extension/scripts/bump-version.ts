#!/usr/bin/env node
/**
 * bump-version.ts - Bump version in package.json and manifest.json
 *
 * Usage: tsx scripts/bump-version.ts <version>
 *
 * This script updates the version field in both package.json and
 * src/manifest.json to ensure consistency across the project.
 *
 * The version is injected as a pure string - no validation or
 * transformation is performed beyond basic format checking.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Pure functions - no I/O

/**
 * Validates a semantic version string.
 * Accepts: X.Y.Z or X.Y.Z-prerelease
 */
const isValidSemver = (version: string): boolean => {
  const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;
  return semverRegex.test(version);
};

/**
 * Updates version in package.json content.
 */
const updatePackageJsonVersion = (content: string, version: string): string => {
  const parsed = JSON.parse(content);
  parsed.version = version;
  return JSON.stringify(parsed, null, 2) + '\n';
};

/**
 * Updates version in manifest.json content.
 */
const updateManifestVersion = (content: string, version: string): string => {
  const parsed = JSON.parse(content);
  parsed.version = version;
  return JSON.stringify(parsed, null, 2) + '\n';
};

// Main function

const main = (): void => {
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
  const packageJsonPath = resolve(projectRoot, 'package.json');
  const manifestJsonPath = resolve(projectRoot, 'src/manifest.json');

  // Read current content
  const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
  const manifestJsonContent = readFileSync(manifestJsonPath, 'utf-8');

  // Parse and update
  const currentPackageVersion = JSON.parse(packageJsonContent).version;
  const currentManifestVersion = JSON.parse(manifestJsonContent).version;

  console.log(`Bumping version:`);
  console.log(`  package.json: ${currentPackageVersion} → ${version}`);
  console.log(`  manifest.json: ${currentManifestVersion} → ${version}`);

  // Write updated content
  writeFileSync(packageJsonPath, updatePackageJsonVersion(packageJsonContent, version), 'utf-8');

  writeFileSync(manifestJsonPath, updateManifestVersion(manifestJsonContent, version), 'utf-8');

  console.log(`\n✅ Version bumped to ${version}`);
};

main();
