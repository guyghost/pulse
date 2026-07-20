#!/usr/bin/env tsx

import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getAllConnectorsMeta } from '../../src/lib/shell/connectors/meta';
import { CONNECTOR_HEALTH_REGISTRY, validateConnectorHealthRegistry } from './connector-registry';
import { createConnectorHealthReport } from './report';
import { createFixtureTestRunner } from './vitest-runner';

let extensionRoot = '';

function pathBelowRoot(relativePath: string): string {
  if (
    isAbsolute(relativePath) ||
    relativePath.includes('\\') ||
    relativePath.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error('Connector health path is outside the committed relative-path policy.');
  }
  const absolute = resolve(extensionRoot, relativePath);
  const fromRoot = relative(extensionRoot, absolute);
  if (fromRoot.startsWith(`..${sep}`) || fromRoot === '..' || isAbsolute(fromRoot)) {
    throw new Error('Connector health path escapes the extension root.');
  }
  let cursor = extensionRoot;
  for (const segment of relativePath.split('/')) {
    cursor = join(cursor, segment);
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink()) {
      throw new Error(`Connector health path contains a symlink: ${relativePath}.`);
    }
  }
  return absolute;
}

function committedEntryExists(relativePath: string): boolean {
  try {
    const stat = lstatSync(pathBelowRoot(relativePath));
    return relativePath.startsWith('tests/unit/') ? stat.isFile() : stat.isDirectory();
  } catch {
    return false;
  }
}

function listFixtureFiles(relativeDirectory: string): string[] {
  return readdirSync(pathBelowRoot(relativeDirectory), { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
}

function verifyRegistryFilesystem(): void {
  validateConnectorHealthRegistry(CONNECTOR_HEALTH_REGISTRY, getAllConnectorsMeta());
  for (const entry of CONNECTOR_HEALTH_REGISTRY) {
    const unitStat = lstatSync(pathBelowRoot(entry.unitTestFile));
    const fixtureStat = lstatSync(pathBelowRoot(entry.regressionFixtureDir));
    if (!unitStat.isFile() || !fixtureStat.isDirectory()) {
      throw new Error(`Connector health registry type drifted for ${entry.id}.`);
    }
    const fixtures = listFixtureFiles(entry.regressionFixtureDir).filter(
      (file) => file.endsWith('.html') || file.endsWith('.json')
    );
    if (fixtures.length === 0) {
      throw new Error(`Connector health fixture set is empty for ${entry.id}.`);
    }
    for (const fixture of fixtures) {
      const goldenPath = `${entry.regressionFixtureDir}/golden/${parse(fixture).name}.json`;
      const goldenStat = lstatSync(pathBelowRoot(goldenPath));
      if (!goldenStat.isFile()) {
        throw new Error(`Connector health golden output is absent for ${entry.id}/${fixture}.`);
      }
    }
  }
}

function main(): void {
  if (process.env.MISSIONPULSE_CONNECTOR_HEALTH_FIXTURE_ONLY !== '1') {
    throw new Error('Connector health refuses to run without fixture-only authority.');
  }
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--json')) {
    throw new Error('Connector health accepts only the optional --json argument.');
  }
  extensionRoot = realpathSync.native(process.cwd());
  verifyRegistryFilesystem();
  const nodeExecutable = realpathSync.native(process.execPath);
  const vitestModulePath = realpathSync.native(
    fileURLToPath(import.meta.resolve('vitest/vitest.mjs'))
  );
  const runTestFile = createFixtureTestRunner({
    extensionRoot,
    nodeExecutable,
    vitestModulePath,
    environment: process.env,
  });
  const report = createConnectorHealthReport({
    now: () => new Date(),
    fileExists: committedEntryExists,
    listFixtureFiles,
    runTestFile,
  });

  if (args[0] === '--json') {
    process.stdout.write(JSON.stringify(report));
  } else {
    for (const connector of report.connectors) {
      process.stdout.write(`${connector.status === 'pass' ? 'PASS' : 'FAIL'} ${connector.name}\n`);
    }
    process.stdout.write(`${report.status === 'pass' ? 'PASS' : 'FAIL'} parser-regression\n`);
  }
  if (report.status === 'fail') {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown connector health failure.';
  process.stderr.write(`connector-health infrastructure failure: ${message}\n`);
  process.exitCode = 2;
}
