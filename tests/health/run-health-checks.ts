/**
 * Health Check Runner
 *
 * Main orchestrator script that runs all connector health checks
 * and generates reports.
 *
 * Usage:
 *   pnpm health-check
 *   pnpm health-check --connector=free-work
 *   pnpm health-check --json
 */

/// <reference types="node" />

import { parseArgs } from 'node:util';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HealthCheckReport, HealthCheckResult } from './types';
import { loadConfig, getScreenshotsDir, isCI } from './config';
import { generateMarkdownReport, generateBadges } from './reporter';

// Import health check functions
import { runFreeWorkHealthCheck } from './connectors/freework.health';
import { runLeHibouHealthCheck } from './connectors/lehibou.health';
import { runHiwayHealthCheck } from './connectors/hiway.health';
import { runCollectiveHealthCheck } from './connectors/collective.health';
import { runCherryPickHealthCheck } from './connectors/cherrypick.health';

interface ConnectorHealthCheck {
  id: string;
  name: string;
  run: (screenshotDir: string) => Promise<HealthCheckResult>;
}

const HEALTH_CHECKS: ConnectorHealthCheck[] = [
  { id: 'free-work', name: 'Free-Work', run: runFreeWorkHealthCheck },
  { id: 'lehibou', name: 'LeHibou', run: runLeHibouHealthCheck },
  { id: 'hiway', name: 'Hiway', run: runHiwayHealthCheck },
  { id: 'collective', name: 'Collective', run: runCollectiveHealthCheck },
  { id: 'cherry-pick', name: 'Cherry Pick', run: runCherryPickHealthCheck },
];

/**
 * Parse command line arguments
 */
function parseCliArgs() {
  const { values } = parseArgs({
    options: {
      connector: {
        type: 'string',
        short: 'c',
        multiple: true,
      },
      json: {
        type: 'boolean',
        short: 'j',
        default: false,
      },
      output: {
        type: 'string',
        short: 'o',
      },
      'fail-fast': {
        type: 'boolean',
        default: false,
      },
      parallel: {
        type: 'boolean',
        default: true,
      },
      help: {
        type: 'boolean',
        short: 'h',
        default: false,
      },
    },
    allowPositionals: true,
  });

  return values;
}

/**
 * Print usage help
 */
function printHelp() {
  console.log(`
MissionPulse Connector Health Checks

Usage:
  pnpm health-check [options]

Options:
  -c, --connector <id>    Run specific connector(s) (can be repeated)
  -j, --json              Output results as JSON
  -o, --output <path>     Write report to file
  --fail-fast             Stop on first failure
  --no-parallel           Run checks sequentially
  -h, --help              Show this help

Available connectors:
  free-work    Free-Work API
  lehibou      LeHibou (scraping)
  hiway        Hiway (Supabase API)
  collective   Collective (GraphQL API)
  cherry-pick  Cherry Pick API

Examples:
  pnpm health-check
  pnpm health-check --connector=free-work --connector=hiway
  pnpm health-check --json --output=report.json
`);
}

/**
 * Run a single health check with timeout wrapper
 */
async function runWithTimeout(
  check: ConnectorHealthCheck,
  screenshotDir: string,
  timeout: number
): Promise<HealthCheckResult> {
  const timeoutPromise = new Promise<HealthCheckResult>((resolve) => {
    setTimeout(() => {
      resolve({
        connectorId: check.id,
        connectorName: check.name,
        status: 'timeout',
        responseTimeMs: timeout,
        timestamp: new Date().toISOString(),
        error: `Health check timed out after ${timeout}ms`,
      });
    }, timeout);
  });

  try {
    return await Promise.race([check.run(screenshotDir), timeoutPromise]);
  } catch (error) {
    return {
      connectorId: check.id,
      connectorName: check.name,
      status: 'failed',
      responseTimeMs: 0,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = parseCliArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const config = loadConfig();
  const screenshotDir = getScreenshotsDir(config);

  // Ensure screenshot directory exists
  if (config.screenshots.enabled && !existsSync(screenshotDir)) {
    mkdirSync(screenshotDir, { recursive: true });
  }

  // Filter connectors based on CLI args
  let checksToRun = HEALTH_CHECKS;
  if (args.connector && args.connector.length > 0) {
    const connectorIds = new Set(args.connector);
    checksToRun = HEALTH_CHECKS.filter((c) => connectorIds.has(c.id));
  }

  // Filter by config
  checksToRun = checksToRun.filter((c) => {
    const connectorConfig = config.connectors[c.id];
    return connectorConfig?.enabled !== false;
  });

  console.log(`\n🔍 Running health checks for ${checksToRun.length} connector(s)...\n`);

  const startTime = Date.now();
  const results: HealthCheckResult[] = [];

  // Run health checks (parallel or sequential)
  if (args.parallel) {
    const promises = checksToRun.map((check) => {
      const timeout = config.connectors[check.id]?.timeout ?? 60000;
      return runWithTimeout(check, screenshotDir, timeout);
    });
    const checkResults = await Promise.all(promises);
    results.push(...checkResults);
  } else {
    for (const check of checksToRun) {
      const timeout = config.connectors[check.id]?.timeout ?? 60000;
      const result = await runWithTimeout(check, screenshotDir, timeout);
      results.push(result);

      // Print progress
      const icon = result.status === 'ok' ? '✅' : result.status === 'timeout' ? '⏱️' : '❌';
      console.log(`  ${icon} ${check.name}: ${result.status} (${result.responseTimeMs}ms)`);

      // Fail fast
      if (args['fail-fast'] && result.status !== 'ok') {
        console.log(`\n⚠️  Stopping due to failure (--fail-fast)`);
        break;
      }
    }
  }

  const durationMs = Date.now() - startTime;

  // Build report
  const report: HealthCheckReport = {
    timestamp: new Date().toISOString(),
    durationMs,
    results,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.status === 'ok').length,
      failed: results.filter((r) => r.status === 'failed' || r.status === 'timeout').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
    },
    environment: {
      node: process.version,
      platform: process.platform,
      ci: isCI(),
    },
  };

  // Output
  if (args.json) {
    const jsonOutput = JSON.stringify(report, null, 2);
    if (args.output) {
      writeFileSync(args.output, jsonOutput);
      console.log(`\n📄 Report saved to ${args.output}`);
    } else {
      console.log(jsonOutput);
    }
  } else {
    // Print markdown report
    console.log('\n' + generateMarkdownReport(report));

    if (args.output) {
      writeFileSync(args.output, generateMarkdownReport(report));
      console.log(`\n📄 Report saved to ${args.output}`);
    }
  }

  // Generate badges if not in CI
  if (!isCI()) {
    const badges = generateBadges(report);
    const badgesDir = join(process.cwd(), 'tests/health/badges');
    if (!existsSync(badgesDir)) {
      mkdirSync(badgesDir, { recursive: true });
    }
    for (const [name, svg] of Object.entries(badges)) {
      writeFileSync(join(badgesDir, `${name}.svg`), svg);
    }
  }

  // Exit with appropriate code
  const hasFailures = report.summary.failed > 0;
  if (hasFailures) {
    console.log(`\n❌ ${report.summary.failed}/${report.summary.total} health check(s) failed`);
    process.exit(1);
  } else {
    console.log(`\n✅ All ${report.summary.passed} health check(s) passed`);
    process.exit(0);
  }
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
