import { describe, expect, it, vi } from 'vitest';

import { createConnectorHealthReport } from '../../health/report';
import {
  CONNECTOR_HEALTH_REGISTRY,
  validateConnectorHealthRegistry,
} from '../../health/connector-registry';
import { getAllConnectorsMeta } from '../../../src/lib/shell/connectors/meta';

const GENERATED_AT = new Date('2026-07-16T08:00:00.000Z');

describe('fixture-only connector health report', () => {
  it('freezes the complete six-row catalog including Malt independently of build filtering', () => {
    expect(CONNECTOR_HEALTH_REGISTRY).toEqual([
      {
        id: 'cherry-pick',
        name: 'Cherry Pick',
        unitTestFile: 'tests/unit/connectors/cherrypick.test.ts',
        regressionFixtureDir: 'tests/fixtures/regression/cherry-pick',
      },
      {
        id: 'collective',
        name: 'Collective',
        unitTestFile: 'tests/unit/connectors/collective.test.ts',
        regressionFixtureDir: 'tests/fixtures/regression/collective',
      },
      {
        id: 'free-work',
        name: 'Free-Work',
        unitTestFile: 'tests/unit/connectors/freework.test.ts',
        regressionFixtureDir: 'tests/fixtures/regression/free-work',
      },
      {
        id: 'hiway',
        name: 'Hiway',
        unitTestFile: 'tests/unit/connectors/hiway.test.ts',
        regressionFixtureDir: 'tests/fixtures/regression/hiway',
      },
      {
        id: 'lehibou',
        name: 'LeHibou',
        unitTestFile: 'tests/unit/connectors/lehibou.test.ts',
        regressionFixtureDir: 'tests/fixtures/regression/lehibou',
      },
      {
        id: 'malt',
        name: 'Malt',
        unitTestFile: 'tests/unit/connectors/malt.test.ts',
        regressionFixtureDir: 'tests/fixtures/regression/malt',
      },
    ]);
    expect(() =>
      validateConnectorHealthRegistry(CONNECTOR_HEALTH_REGISTRY, getAllConnectorsMeta())
    ).not.toThrow();
  });

  it('rejects empty, duplicate, missing, name/path and catalog drift', () => {
    const catalog = getAllConnectorsMeta();
    expect(() => validateConnectorHealthRegistry([], catalog)).toThrow(/nonempty/i);
    expect(() =>
      validateConnectorHealthRegistry(
        [...CONNECTOR_HEALTH_REGISTRY, CONNECTOR_HEALTH_REGISTRY[0]],
        catalog
      )
    ).toThrow(/duplicate/i);
    expect(() =>
      validateConnectorHealthRegistry(CONNECTOR_HEALTH_REGISTRY.slice(1), catalog)
    ).toThrow(/catalog/i);
    expect(() =>
      validateConnectorHealthRegistry(
        CONNECTOR_HEALTH_REGISTRY.map((entry) =>
          entry.id === 'malt' ? { ...entry, name: 'Malt drift' } : entry
        ),
        catalog
      )
    ).toThrow(/catalog/i);
    expect(() =>
      validateConnectorHealthRegistry(
        CONNECTOR_HEALTH_REGISTRY.map((entry) =>
          entry.id === 'malt' ? { ...entry, unitTestFile: '../malt.test.ts' } : entry
        ),
        catalog
      )
    ).toThrow(/path/i);
  });

  it('emits the complete sorted registry and exact passing check contract', () => {
    const runTestFile = vi.fn(() => true);
    const report = createConnectorHealthReport({
      now: () => GENERATED_AT,
      fileExists: () => true,
      listFixtureFiles: () => ['one.html', 'two.json', 'ignored.txt'],
      runTestFile,
    });

    expect(report).toEqual({
      schema: 'missionpulse.connector-health-report',
      version: 1,
      generatedAt: '2026-07-16T08:00:00.000Z',
      status: 'pass',
      connectors: [...CONNECTOR_HEALTH_REGISTRY]
        .sort(({ id: left }, { id: right }) =>
          Buffer.compare(Buffer.from(left), Buffer.from(right))
        )
        .map(({ id, name }) => ({
          connectorId: id,
          name,
          status: 'pass',
          checks: [
            { id: 'unit-tests', status: 'pass', code: 'unit_tests_passed', detail: null },
            {
              id: 'regression-fixtures',
              status: 'pass',
              code: 'regression_fixtures_present',
              detail: '2',
            },
          ],
        })),
      regression: {
        id: 'parser-regression',
        status: 'pass',
        code: 'parser_regression_passed',
        detail: null,
      },
    });
    expect(runTestFile).toHaveBeenCalledTimes(CONNECTOR_HEALTH_REGISTRY.length + 1);
    expect(runTestFile).toHaveBeenLastCalledWith('tests/unit/regression/parser-regression.test.ts');
  });

  it('uses stable failure codes for missing tests, empty fixtures and failed regression', () => {
    const first = CONNECTOR_HEALTH_REGISTRY[0];
    const report = createConnectorHealthReport({
      now: () => GENERATED_AT,
      fileExists: (path) => path !== first.unitTestFile,
      listFixtureFiles: (path) => (path === first.regressionFixtureDir ? [] : ['fixture.html']),
      runTestFile: (path) => path !== 'tests/unit/regression/parser-regression.test.ts',
    });

    const failed = report.connectors.find(({ connectorId }) => connectorId === first.id);
    expect(failed).toMatchObject({
      status: 'fail',
      checks: [
        { id: 'unit-tests', status: 'fail', code: 'unit_test_file_missing', detail: null },
        {
          id: 'regression-fixtures',
          status: 'fail',
          code: 'regression_fixture_set_empty',
          detail: null,
        },
      ],
    });
    expect(report.regression).toEqual({
      id: 'parser-regression',
      status: 'fail',
      code: 'parser_regression_failed',
      detail: null,
    });
    expect(report.status).toBe('fail');
  });
});
