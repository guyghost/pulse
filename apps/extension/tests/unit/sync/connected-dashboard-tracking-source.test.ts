import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const syncSource = readFileSync(
  resolve(process.cwd(), 'src/lib/shell/sync/connected-dashboard.ts'),
  'utf8'
);

function syncTrackingBlock(): string {
  const start = syncSource.indexOf('export async function syncConnectedDashboardTracking');
  const end = syncSource.indexOf('export async function getConnectedDashboardSyncStatus');

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return syncSource.slice(start, end);
}

describe('connected dashboard tracking sync orchestration', () => {
  it('returns pull failures before marking the tracking sync globally successful', () => {
    const block = syncTrackingBlock();
    const failureBranch = 'if (!pulledApplications.ok) {\n    return pulledApplications;\n  }';
    const failureIndex = block.indexOf(failureBranch);
    const syncedIndex = block.indexOf('await markConnectedDashboardSynced(context.now)');

    expect(failureIndex).toBeGreaterThanOrEqual(0);
    expect(syncedIndex).toBeGreaterThanOrEqual(0);
    expect(failureIndex).toBeLessThan(syncedIndex);
  });
});
