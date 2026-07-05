import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageServerSource = readFileSync(resolve(process.cwd(), 'src/routes/+page.server.ts'), 'utf8');

function sourceAfter(marker: string, occurrence = 1): string {
  let index = -1;
  let fromIndex = 0;
  for (let count = 0; count < occurrence; count += 1) {
    index = pageServerSource.indexOf(marker, fromIndex);
    fromIndex = index + marker.length;
  }
  expect(index, `Missing marker: ${marker}`).toBeGreaterThanOrEqual(0);
  return pageServerSource.slice(index);
}

function expectApplicationUpdateBeforeEventUpsert(section: string): void {
  const updateIndex = section.search(/\.from\('applications'\)\s+\.update/);
  const eventIndex = section.indexOf('await upsertDashboardPipelineEvent');

  expect(updateIndex).toBeGreaterThanOrEqual(0);
  expect(eventIndex).toBeGreaterThanOrEqual(0);
  expect(updateIndex).toBeLessThan(eventIndex);
}

describe('dashboard pipeline event write order', () => {
  it('does not insert transition events before optimistic-lock application updates', () => {
    // The shared applyMissionStageTransition helper owns the detected→target
    // write path for both per-mission and bulk actions, so the invariant only
    // needs to hold there (single occurrence) plus the standalone
    // transitionApplication action.
    expectApplicationUpdateBeforeEventUpsert(
      sourceAfter("if (existingApplication.stage === 'detected') {")
    );
    expectApplicationUpdateBeforeEventUpsert(sourceAfter('transitionApplication: async'));
  });
});

describe('dashboard bulk action truncation reporting', () => {
  // The cap exists to bound payload/transaction size, but it must not silently
  // drop selected missions. `requestedCount` is the pre-cap submission size and
  // `truncated` is the number dropped, so the UI can surface the partial result
  // instead of reporting a misleading full success.
  it('readBulkMissionIds returns the requested count alongside the capped ids', () => {
    const helperSection = pageServerSource.slice(
      pageServerSource.indexOf('function readBulkMissionIds(')
    );
    expect(helperSection).toContain('requestedCount: unique.length');
    expect(helperSection).toContain('.slice(0, BULK_MISSION_CAP)');
  });

  it('both bulk actions report total from requestedCount and a truncated delta', () => {
    const selectSection = sourceAfter('bulkSelectMissions: async');
    const archiveSection = sourceAfter('bulkArchiveMissions: async');
    for (const section of [selectSection, archiveSection]) {
      expect(section).toContain('total: requestedCount');
      expect(section).toContain('truncated: requestedCount - missionIds.length');
      expect(section).toContain('outcome.ok && outcome.changed');
    }
  });
});
