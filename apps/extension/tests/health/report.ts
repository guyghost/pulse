import type {
  ConnectorHealthCheck,
  ConnectorHealthReportV1,
} from '../../scripts/connector-health/contracts';
import { getAllConnectorsMeta } from '../../src/lib/shell/connectors/meta';
import { CONNECTOR_HEALTH_REGISTRY, validateConnectorHealthRegistry } from './connector-registry';

export interface ConnectorHealthReportDependencies {
  now: () => Date;
  fileExists: (relativePath: string) => boolean;
  listFixtureFiles: (relativeDirectory: string) => readonly string[];
  runTestFile: (relativePath: string) => boolean;
}

function unitTestCheck(
  unitTestFile: string,
  dependencies: ConnectorHealthReportDependencies
): ConnectorHealthCheck {
  if (!dependencies.fileExists(unitTestFile)) {
    return {
      id: 'unit-tests',
      status: 'fail',
      code: 'unit_test_file_missing',
      detail: null,
    };
  }
  const passed = dependencies.runTestFile(unitTestFile);
  return {
    id: 'unit-tests',
    status: passed ? 'pass' : 'fail',
    code: passed ? 'unit_tests_passed' : 'unit_tests_failed',
    detail: null,
  };
}

function regressionFixtureCheck(
  fixtureDirectory: string,
  dependencies: ConnectorHealthReportDependencies
): ConnectorHealthCheck {
  if (!dependencies.fileExists(fixtureDirectory)) {
    return {
      id: 'regression-fixtures',
      status: 'fail',
      code: 'regression_fixture_directory_missing',
      detail: null,
    };
  }
  const fixtureCount = dependencies
    .listFixtureFiles(fixtureDirectory)
    .filter((file) => file.endsWith('.html') || file.endsWith('.json')).length;
  if (fixtureCount === 0) {
    return {
      id: 'regression-fixtures',
      status: 'fail',
      code: 'regression_fixture_set_empty',
      detail: null,
    };
  }
  return {
    id: 'regression-fixtures',
    status: 'pass',
    code: 'regression_fixtures_present',
    detail: String(fixtureCount),
  };
}

export function createConnectorHealthReport(
  dependencies: ConnectorHealthReportDependencies
): ConnectorHealthReportV1 {
  validateConnectorHealthRegistry(CONNECTOR_HEALTH_REGISTRY, getAllConnectorsMeta());
  const generatedAt = dependencies.now().toISOString();
  const connectors = [...CONNECTOR_HEALTH_REGISTRY]
    .sort(({ id: left }, { id: right }) =>
      Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
    )
    .map((entry) => {
      const checks = [
        unitTestCheck(entry.unitTestFile, dependencies),
        regressionFixtureCheck(entry.regressionFixtureDir, dependencies),
      ];
      return {
        connectorId: entry.id,
        name: entry.name,
        status: checks.every((check) => check.status === 'pass')
          ? ('pass' as const)
          : ('fail' as const),
        checks,
      };
    });
  const regressionPassed = dependencies.runTestFile(
    'tests/unit/regression/parser-regression.test.ts'
  );
  const regression: ConnectorHealthReportV1['regression'] = {
    id: 'parser-regression',
    status: regressionPassed ? 'pass' : 'fail',
    code: regressionPassed ? 'parser_regression_passed' : 'parser_regression_failed',
    detail: null,
  };
  return {
    schema: 'missionpulse.connector-health-report',
    version: 1,
    generatedAt,
    status:
      connectors.every((connector) => connector.status === 'pass') && regression.status === 'pass'
        ? 'pass'
        : 'fail',
    connectors,
    regression,
  };
}
