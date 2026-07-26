import { describe, expect, it } from 'vitest';

import {
  canonicalTimestamp,
  createReleaseGateInputCli,
  derivePlaywrightScenarioResults,
} from '../../../scripts/create-release-gate-input';

function playwrightReport(
  tests: Array<{
    id?: string;
    expectedStatus?: string;
    actualStatus?: string;
    outcome?: string;
    extraAnnotations?: Array<{ type: string; description?: string }>;
    resultCount?: number;
  }>
) {
  return {
    suites: [
      {
        title: 'root',
        specs: tests.map((entry, index) => ({
          title: `spec-${index}`,
          tests: [
            {
              annotations: [
                ...(entry.id === undefined ? [] : [{ type: 'scenario-id', description: entry.id }]),
                ...(entry.extraAnnotations ?? []),
              ],
              expectedStatus: entry.expectedStatus ?? 'passed',
              status: entry.outcome ?? 'expected',
              results: Array.from({ length: entry.resultCount ?? 1 }, () => ({
                status: entry.actualStatus ?? 'passed',
              })),
            },
          ],
        })),
      },
    ],
  };
}

describe('release gate Playwright report derivation', () => {
  it('rejects canonical-looking timestamps before year 2000', () => {
    expect(() => canonicalTimestamp('1999-12-31T23:59:59.999Z', 'gate-time')).toThrow(
      /canonical timestamp/
    );
  });

  it('derives exact expected outcomes in committed inventory order', () => {
    const inventory = ['harness.expected-failure', 'navigation.all-tabs'];
    const raw = playwrightReport([
      { id: 'navigation.all-tabs' },
      {
        id: 'harness.expected-failure',
        expectedStatus: 'failed',
        actualStatus: 'failed',
      },
    ]);

    expect(derivePlaywrightScenarioResults(raw, inventory)).toEqual([
      {
        scenarioId: 'harness.expected-failure',
        expectedStatus: 'failed',
        actualStatus: 'failed',
        outcome: 'expected',
      },
      {
        scenarioId: 'navigation.all-tabs',
        expectedStatus: 'passed',
        actualStatus: 'passed',
        outcome: 'expected',
      },
    ]);
  });

  it.each([
    ['missing annotation', playwrightReport([{}])],
    [
      'duplicate annotation',
      playwrightReport([
        {
          id: 'navigation.all-tabs',
          extraAnnotations: [{ type: 'scenario-id', description: 'navigation.all-tabs' }],
        },
      ]),
    ],
    [
      'unexpected outcome',
      playwrightReport([{ id: 'navigation.all-tabs', outcome: 'unexpected' }]),
    ],
    ['retry result', playwrightReport([{ id: 'navigation.all-tabs', resultCount: 2 }])],
    ['missing scenario', playwrightReport([])],
  ])('rejects %s instead of manufacturing green evidence', (_label, raw) => {
    expect(() => derivePlaywrightScenarioResults(raw, ['navigation.all-tabs'])).toThrow();
  });

  it.each([
    [
      'unknown flag',
      ['--capture-tree', '--dist', '/unused', '--output', '/unused', '--surprise', 'value'],
      'Unknown argument: --surprise',
    ],
    [
      'duplicate flag',
      ['--capture-tree', '--dist', '/unused', '--dist', '/other', '--output', '/unused'],
      'Duplicate argument: --dist',
    ],
  ])('rejects a %s at the release CLI boundary', async (_label, args, expectedMessage) => {
    await expect(createReleaseGateInputCli(args)).rejects.toThrow(expectedMessage);
  });
});
