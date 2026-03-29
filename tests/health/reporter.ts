/**
 * Health Check Reporter
 *
 * Generates reports in various formats:
 * - Markdown (for GitHub Issues)
 * - JSON (for CI processing)
 * - SVG badges (for README)
 */

/// <reference types="node" />

import type { HealthCheckReport, HealthCheckResult, BadgeColor, GitHubIssuePayload } from './types';

/**
 * Get status icon for markdown
 */
function getStatusIcon(status: HealthCheckResult['status']): string {
  switch (status) {
    case 'ok':
      return '✅';
    case 'failed':
      return '❌';
    case 'timeout':
      return '⏱️';
    case 'skipped':
      return '⏭️';
    default:
      return '❓';
  }
}

/**
 * Format duration for display
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Generate markdown report
 */
export function generateMarkdownReport(report: HealthCheckReport): string {
  const lines: string[] = [
    `# Connector Health Check Report`,
    ``,
    `**Generated:** ${new Date(report.timestamp).toLocaleString()}`,
    `**Duration:** ${formatDuration(report.durationMs)}`,
    ``,
    `## Summary`,
    ``,
    `| Status | Count |`,
    `|--------|-------|`,
    `| ✅ Passed | ${report.summary.passed} |`,
    `| ❌ Failed | ${report.summary.failed} |`,
    `| ⏭️ Skipped | ${report.summary.skipped} |`,
    `| **Total** | **${report.summary.total}** |`,
    ``,
    `## Connector Results`,
    ``,
    `| Connector | Status | Response Time | Missions Found | Error |`,
    `|-----------|--------|---------------|----------------|-------|`,
  ];

  for (const result of report.results) {
    const icon = getStatusIcon(result.status);
    const missions = result.missionsFound?.toString() ?? '-';
    const error = result.error
      ? `\`${result.error.substring(0, 50)}${result.error.length > 50 ? '...' : ''}\``
      : '-';

    lines.push(
      `| ${result.connectorName} | ${icon} ${result.status} | ${formatDuration(result.responseTimeMs)} | ${missions} | ${error} |`
    );
  }

  // Add error details section if any failures
  const failures = report.results.filter((r) => r.status === 'failed' || r.status === 'timeout');
  if (failures.length > 0) {
    lines.push(``, `## Error Details`, ``);

    for (const failure of failures) {
      lines.push(`### ${failure.connectorName}`, ``);
      lines.push(`- **Status:** ${failure.status}`);
      lines.push(`- **Error:** ${failure.error ?? 'Unknown error'}`);

      if (failure.errorDetails) {
        lines.push(``, `<details>`, `<summary>Error Details</summary>`, ``);
        lines.push('```json');
        lines.push(JSON.stringify(failure.errorDetails, null, 2));
        lines.push('```');
        lines.push(`</details>`, ``);
      }

      if (failure.screenshotPath) {
        lines.push(`- **Screenshot:** \`${failure.screenshotPath}\``);
      }

      lines.push(``);
    }
  }

  // Add environment info
  lines.push(``, `## Environment`, ``);
  lines.push(`- **Node:** ${report.environment.node}`);
  lines.push(`- **Platform:** ${report.environment.platform}`);
  lines.push(`- **CI:** ${report.environment.ci ? 'Yes' : 'No'}`);

  return lines.join('\n');
}

/**
 * Generate JSON report
 */
export function generateJsonReport(report: HealthCheckReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Get badge color based on pass rate
 */
function getBadgeColor(passed: number, total: number): BadgeColor {
  if (total === 0) return 'lightgrey';
  const rate = passed / total;
  if (rate === 1) return 'brightgreen';
  if (rate >= 0.8) return 'green';
  if (rate >= 0.6) return 'yellowgreen';
  if (rate >= 0.4) return 'yellow';
  return 'red';
}

/**
 * Generate shields.io compatible SVG badge
 */
function generateBadge(label: string, message: string, color: BadgeColor): string {
  const colorMap: Record<BadgeColor, string> = {
    brightgreen: '#4c1',
    green: '#97ca00',
    yellowgreen: '#a4a61d',
    yellow: '#dfb317',
    orange: '#fe7d37',
    red: '#e05d44',
    blue: '#007ec6',
    lightgrey: '#9f9f9f',
  };

  const bgColor = colorMap[color];
  const labelWidth = Math.max(label.length * 6 + 10, 30);
  const messageWidth = Math.max(message.length * 6 + 10, 30);
  const totalWidth = labelWidth + messageWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20">
  <rect width="${labelWidth}" height="20" fill="#555"/>
  <rect x="${labelWidth}" width="${messageWidth}" height="20" fill="${bgColor}"/>
  <rect width="${totalWidth}" height="20" fill="url(#gradient)"/>
  <text x="${labelWidth / 2}" y="14" fill="#fff" font-family="Arial" font-size="10" text-anchor="middle">${label}</text>
  <text x="${labelWidth + messageWidth / 2}" y="14" fill="#fff" font-family="Arial" font-size="10" text-anchor="middle" font-weight="bold">${message}</text>
  <defs>
    <linearGradient id="gradient" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".1"/>
      <stop offset="1" stop-opacity=".1"/>
    </linearGradient>
  </defs>
</svg>`;
}

/**
 * Generate all badges for the report
 */
export function generateBadges(report: HealthCheckReport): Record<string, string> {
  const color = getBadgeColor(report.summary.passed, report.summary.total);

  return {
    'connectors-status': generateBadge(
      'connectors',
      `${report.summary.passed}/${report.summary.total}`,
      color
    ),
    'connectors-health': generateBadge(
      'health',
      report.summary.failed === 0 ? 'passing' : 'failing',
      color
    ),
    'response-time': generateBadge('response', formatDuration(report.durationMs), 'blue'),
  };
}

/**
 * Generate GitHub Issue payload for failed connectors
 */
export function generateGitHubIssue(report: HealthCheckReport): GitHubIssuePayload | null {
  const failures = report.results.filter((r) => r.status === 'failed' || r.status === 'timeout');

  if (failures.length === 0) {
    return null;
  }

  const title =
    failures.length === 1
      ? `🔴 Health Check Failed: ${failures[0].connectorName}`
      : `🔴 ${failures.length} Connector Health Checks Failed`;

  const body = generateMarkdownReport(report);

  return {
    title,
    body,
    labels: ['health-check', 'bug', 'connectors'],
  };
}

/**
 * Format report for Slack notification
 */
export function generateSlackMessage(report: HealthCheckReport): string {
  const statusEmoji = report.summary.failed === 0 ? '✅' : '❌';
  const statusText =
    report.summary.failed === 0
      ? 'All connectors healthy'
      : `${report.summary.failed} connector(s) failed`;

  const blocks: string[] = [
    `${statusEmoji} *Connector Health Check*`,
    ``,
    `${statusText}`,
    `Duration: ${formatDuration(report.durationMs)}`,
    ``,
  ];

  for (const result of report.results) {
    const icon = getStatusIcon(result.status);
    blocks.push(
      `${icon} ${result.connectorName}: ${result.status} (${formatDuration(result.responseTimeMs)})`
    );
  }

  return blocks.join('\n');
}

/**
 * Print console report
 */
export function printConsoleReport(report: HealthCheckReport): void {
  console.log('\n' + '='.repeat(60));
  console.log('CONNECTOR HEALTH CHECK REPORT');
  console.log('='.repeat(60));
  console.log(`\nTimestamp: ${report.timestamp}`);
  console.log(`Duration: ${formatDuration(report.durationMs)}`);
  console.log(`\nSummary:`);
  console.log(`  ✅ Passed:  ${report.summary.passed}`);
  console.log(`  ❌ Failed:  ${report.summary.failed}`);
  console.log(`  ⏭️ Skipped: ${report.summary.skipped}`);
  console.log(`\nConnector Results:`);

  for (const result of report.results) {
    const icon = getStatusIcon(result.status);
    console.log(`  ${icon} ${result.connectorName}`);
    console.log(`     Status: ${result.status}`);
    console.log(`     Time: ${formatDuration(result.responseTimeMs)}`);
    if (result.missionsFound !== undefined) {
      console.log(`     Missions: ${result.missionsFound}`);
    }
    if (result.error) {
      console.log(`     Error: ${result.error}`);
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');
}
