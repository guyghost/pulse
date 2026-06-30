#!/usr/bin/env tsx
/**
 * Health checks connecteurs — fixture-based, sans appels live.
 *
 * Usage:
 *   pnpm health-check
 *   pnpm health-check:json > report.json
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CONNECTOR_HEALTH_REGISTRY } from './connector-registry';

export interface ConnectorHealthCheckResult {
  connectorId: string;
  name: string;
  status: 'pass' | 'fail';
  checks: Array<{ name: string; status: 'pass' | 'fail'; detail?: string }>;
}

export interface HealthCheckReport {
  generatedAt: string;
  status: 'pass' | 'fail';
  connectors: ConnectorHealthCheckResult[];
}

const EXTENSION_ROOT = process.cwd();

function checkUnitTestFile(entry: (typeof CONNECTOR_HEALTH_REGISTRY)[number]) {
  const path = join(EXTENSION_ROOT, entry.unitTestFile);
  if (!existsSync(path)) {
    return {
      name: 'unit-test-file',
      status: 'fail' as const,
      detail: `Missing ${entry.unitTestFile}`,
    };
  }

  try {
    execSync(`pnpm exec vitest run ${entry.unitTestFile}`, {
      cwd: EXTENSION_ROOT,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return { name: 'unit-tests', status: 'pass' as const };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { name: 'unit-tests', status: 'fail' as const, detail };
  }
}

function checkRegressionFixtures(entry: (typeof CONNECTOR_HEALTH_REGISTRY)[number]) {
  if (!entry.regressionFixtureDir) {
    return {
      name: 'regression-fixtures',
      status: 'pass' as const,
      detail: 'Not registered for golden regression yet',
    };
  }

  const fixtureDir = join(EXTENSION_ROOT, entry.regressionFixtureDir);
  if (!existsSync(fixtureDir)) {
    return {
      name: 'regression-fixtures',
      status: 'fail' as const,
      detail: `Missing fixture dir ${entry.regressionFixtureDir}`,
    };
  }

  const htmlFixtures = readdirSync(fixtureDir).filter(
    (file) => file.endsWith('.html') || file.endsWith('.json')
  );
  if (htmlFixtures.length === 0) {
    return {
      name: 'regression-fixtures',
      status: 'fail' as const,
      detail: 'No regression fixtures found',
    };
  }

  return {
    name: 'regression-fixtures',
    status: 'pass' as const,
    detail: `${htmlFixtures.length} fixture(s)`,
  };
}

export function runHealthChecks(): HealthCheckReport {
  const connectors: ConnectorHealthCheckResult[] = CONNECTOR_HEALTH_REGISTRY.map((entry) => {
    const checks = [checkUnitTestFile(entry), checkRegressionFixtures(entry)];
    const status = checks.every((check) => check.status === 'pass') ? 'pass' : 'fail';

    return {
      connectorId: entry.id,
      name: entry.name,
      status,
      checks,
    };
  });

  const status = connectors.every((connector) => connector.status === 'pass') ? 'pass' : 'fail';

  return {
    generatedAt: new Date().toISOString(),
    status,
    connectors,
  };
}

function runRegressionSuite(): { status: 'pass' | 'fail'; detail?: string } {
  try {
    execSync('pnpm exec vitest run tests/unit/regression/parser-regression.test.ts', {
      cwd: EXTENSION_ROOT,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return { status: 'pass' };
  } catch (error) {
    return {
      status: 'fail',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function main(): void {
  const report = runHealthChecks();
  const regression = runRegressionSuite();

  const fullReport = {
    ...report,
    regression,
    status:
      report.status === 'pass' && regression.status === 'pass'
        ? ('pass' as const)
        : ('fail' as const),
  };

  const json = `${JSON.stringify(fullReport, null, 2)}\n`;
  const outputJson = process.argv.includes('--json') || process.env.HEALTH_CHECK_JSON === '1';

  if (outputJson) {
    process.stdout.write(json);
  } else {
    for (const connector of fullReport.connectors) {
      const icon = connector.status === 'pass' ? '✓' : '✗';
      console.log(`${icon} ${connector.name} (${connector.connectorId})`);
      for (const check of connector.checks) {
        const checkIcon = check.status === 'pass' ? '  ✓' : '  ✗';
        console.log(`${checkIcon} ${check.name}${check.detail ? `: ${check.detail}` : ''}`);
      }
    }

    const regressionIcon = regression.status === 'pass' ? '✓' : '✗';
    console.log(`${regressionIcon} parser-regression`);
    if (regression.detail) {
      console.log(`  ${regression.detail}`);
    }

    console.log(`\nStatus: ${fullReport.status.toUpperCase()}`);
  }

  if (fullReport.status === 'fail') {
    process.exit(1);
  }
}

main();
