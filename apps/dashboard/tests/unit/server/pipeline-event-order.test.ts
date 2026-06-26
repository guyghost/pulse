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
    expectApplicationUpdateBeforeEventUpsert(
      sourceAfter("if (existingApplication.stage === 'detected') {")
    );
    expectApplicationUpdateBeforeEventUpsert(
      sourceAfter("if (existingApplication.stage === 'detected') {", 2)
    );
    expectApplicationUpdateBeforeEventUpsert(sourceAfter('transitionApplication: async'));
  });
});
