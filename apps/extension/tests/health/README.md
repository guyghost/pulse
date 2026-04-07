# MissionPulse Connector Health Checks

This directory contains health check tests for all MissionPulse connectors. Health checks verify that external job platforms are still accessible and their data structures haven't changed.

## Purpose

- **Early Detection**: Identify broken connectors before users notice
- **CI Integration**: Automated daily checks via GitHub Actions
- **Debugging**: Screenshots and detailed error reports for troubleshooting
- **Monitoring**: Track connector reliability over time

## Quick Start

```bash
# Run all health checks
pnpm health-check

# Run specific connector
pnpm health-check --connector=free-work

# Output as JSON
pnpm health-check --json

# Write report to file
pnpm health-check --output=health-report.md
```

## Architecture
```
tests/health/
├── connectors/              # Individual health check tests
│   ├── freework.health.test.ts
│   ├── lehibou.health.test.ts
│   ├── hiway.health.test.ts
│   ├── collective.health.test.ts
│   └── cherrypick.health.test.ts
├── screenshots/             # Error screenshots (git-ignored)
├── badges/                  # Status badges (generated locally)
├── types.ts                 # TypeScript types
├── config.ts                # Configuration loader
├── run-health-checks.ts     # Main orchestrator script
├── reporter.ts              # Report generation
└── README.md                # This file
```

## Connector Types

### API-Based Connectors
These connectors use public or authenticated APIs:

| Connector | Type | Auth Required |
|-----------|------|---------------|
| Free-Work | REST API | No (public) |
| Hiway | Supabase | No (anon key) |
| Cherry Pick | REST API | No (public) |
| Collective | GraphQL | Yes |

### Scraping Connectors
These connectors require browser automation

| Connector | Type | Auth Required |
|-----------|------|---------------|
| LeHibou | HTML Scraping | Yes |

## Health Check Results
Each health check returns:

```typescript
interface HealthCheckResult {
  connectorId: string;       // e.g., 'free-work'
  connectorName: string;     // e.g., 'Free-Work'
  status: 'ok' | 'failed' | 'timeout' | 'skipped';
  responseTimeMs: number;    // Response time in milliseconds
  timestamp: string;         // ISO timestamp
  error?: string;            // Error message if failed
  errorDetails?: object;     // Detailed error info
  screenshotPath?: string;   // Path to screenshot (for scraping)
  missionsFound?: number;    // Number of missions extracted
}
```

## Configuration
Create `health-check.config.json` in the project root (optional):

```json
{
  "connectors": {
    "free-work": { "enabled": true, "timeout": 30000 },
    "lehibou": { "enabled": true, "timeout": 60000 },
    "hiway": { "enabled": true, "timeout": 60000 },
    "collective": { "enabled": true, "timeout": 60000 },
    "cherry-pick": { "enabled": true, "timeout": 60000 }
  },
  "screenshots": {
    "enabled": true,
    "directory": "tests/health/screenshots"
  },
  "failFast": false,
  "parallel": true
}
```

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `HEALTH_CHECK_TIMEOUT` | Default timeout in ms | 30000 |
| `CI` | Detect CI environment | auto |

## CI Integration

### GitHub Actions

```yaml
name: Connector Health Checks

on:
  schedule:
    # Run daily at 8:00 AM UTC
    - cron: '0 8 * * *'
  workflow_dispatch: # Manual trigger

jobs:
  health-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v2
        with:
          version: 10
          
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
          
      - run: pnpm install
      
      - name: Run health checks
        run: pnpm health-check --json --output=health-report.json
        env:
          HEALTH_CHECK_TIMEOUT: 60000
          
      - name: Create Issue on Failure
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = JSON.parse(fs.readFileSync('health-report.json', 'utf8'));
            const failures = report.results.filter(r => r.status !== 'ok');
            
            if (failures.length > 0) {
              await github.rest.issues.create({
                owner: context.repo.owner,
                repo: context.repo.repo,
                title: `Connector Health Check Failed - ${new Date().toISOString().split('T')[0]}`,
                body: `## Failed Connectors\n\n${failures.map(f => 
                  `- **${f.connectorName}**: ${f.error}`
                ).join('\n')}\n\n**Report:**\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\``,
                labels: ['health-check', 'bug']
              });
            }
```

### Example Report

When running `pnpm health-check`, you you will see output like:

```
🔍 Running health checks for 5 connector(s)...

  ✅ Free-Work: ok (450ms)
  ✅ Hiway: ok (320ms)
  ⚠️ LeHibou: timeout (60000ms)
  ✅ Cherry Pick: ok (280ms)
  ✅ Collective: ok (150ms)

# Connector Health Check Report

**Generated:** 3/25/2026, 10:00:00 AM
**Duration:** 1m 5s

## Summary
| Status | Count |
|--------|-------|
| ✅ Passed | 4 |
| ❌ Failed | 0 |
| ⏱️ Skipped | 0 |
| **Total** | **5** |

## Connector Results
| Connector | Status | Response Time | Missions Found |
|-----------|------|----------------|-----------------|
| Free-Work | ✅ | 450ms | 50 |
| LeHibou | ⏱️ | 60000ms | - |
| Hiway | ✅ | 320ms | 10 |
| Collective | ✅ | 150ms | 0 (auth) |
| Cherry Pick | ✅ | 280ms | 15 |

✅ All 5 health check(s) passed
```

## Writing New Health Checks
See `tests/health/connectors/freework.health.test.ts` for an example of how to write health checks.

### Template for API Connector

```typescript
/// <reference types="node" />

import { test, expect } from '@playwright/test';
import { parseMyApi, type MyApiResponse } from '../../../src/lib/core/connectors/my-parser';
import type { HealthCheckResult } from '../types';

const API_URL = 'https://api.example.com/missions';
const TIMEOUT = parseInt(process.env.HEALTH_CHECK_TIMEOUT ?? '30000', 10);

test.describe('MyConnector Health Check', () => {
  test('API responds with valid JSON', async ({ request }) => {
    const response = await request.get(API_URL, { timeout: TIMEOUT });
    expect(response.ok()).toBe(true);
    
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('Parser extracts missions', async ({ request }) => {
    const response = await request.get(API_URL, { timeout: TIMEOUT });
    const data = await response.json() as MyApiResponse;
    const missions = parseMyApi(data, new Date());
    
    expect(missions.length).toBeGreaterThan(0);
    expect(missions[0]).toHaveProperty('id');
    expect(missions[0]).toHaveProperty('title');
  });
});

export async function runMyConnectorHealthCheck(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    const response = await fetch(API_URL, {
      signal: AbortSignal.timeout(TIMEOUT),
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      return {
        connectorId: 'my-connector',
        connectorName: 'My Connector',
        status: 'failed',
        responseTimeMs: responseTime,
        timestamp,
        error: `API returned status ${response.status}`,
      };
    }

    const data = await response.json() as MyApiResponse;
    const missions = parseMyApi(data, new Date());

    return {
      connectorId: 'my-connector',
      connectorName: 'My Connector',
      status: 'ok',
      responseTimeMs: responseTime,
      timestamp,
      missionsFound: missions.length,
    };
  } catch (error) {
    return {
      connectorId: 'my-connector',
      connectorName: 'My Connector',
      status: 'failed',
      responseTimeMs: Date.now() - startTime,
      timestamp,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

## Troubleshooting

### Common Issues

1. **Timeout Errors**: Increase `HEALTH_CHECK_TIMEOUT` env var
2. **Auth Errors**: Expected for LeHibou/Collective without session
3. **Network Errors**: Check your internet connection
4. **Parser Errors**: Site structure may have changed

### Screenshots
When a scraping connector fails, a screenshot is saved to `tests/health/screenshots/` for debugging.
