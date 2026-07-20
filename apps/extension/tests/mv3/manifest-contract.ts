import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  resolveIncludedConnectors,
  type ConnectorConfig,
  type ConnectorEnv,
} from '../../scripts/resolve-connectors';
import { ALL_CONNECTOR_IDS, getAllConnectorsMeta } from '../../src/lib/shell/connectors/meta';

export const EXPECTED_PERMISSIONS = [
  'sidePanel',
  'storage',
  'cookies',
  'alarms',
  'notifications',
  'declarativeNetRequest',
  'scripting',
  'activeTab',
] as const;

export const EXPECTED_OPTIONAL_HOST_PERMISSIONS = ['https://www.linkedin.com/*'] as const;

export interface ManifestPermissionSurface {
  readonly permissions?: readonly string[];
  readonly host_permissions?: readonly string[];
  readonly optional_host_permissions?: readonly string[];
}

export interface ExpectedHostPermissionOptions {
  readonly config?: ConnectorConfig;
  readonly env?: ConnectorEnv;
}

const connectorConfigPath = resolve(import.meta.dirname, '../../connectors.config.json');

function loadConnectorConfig(): ConnectorConfig {
  try {
    return JSON.parse(readFileSync(connectorConfigPath, 'utf8')) as ConnectorConfig;
  } catch (error) {
    throw new Error(
      `Cannot load the connector build snapshot at ${connectorConfigPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function currentConnectorEnv(): ConnectorEnv {
  return {
    CONNECTORS_INCLUDE: process.env.CONNECTORS_INCLUDE,
    CONNECTORS_EXCLUDE: process.env.CONNECTORS_EXCLUDE,
  };
}

export function getExpectedHostPermissions(options: ExpectedHostPermissionOptions = {}): string[] {
  const resolution = resolveIncludedConnectors({
    allIds: ALL_CONNECTOR_IDS,
    config: options.config ?? loadConnectorConfig(),
    env: options.env ?? currentConnectorEnv(),
  });
  if (resolution.warnings.length > 0) {
    throw new Error(`Connector resolution warnings: ${resolution.warnings.join('; ')}`);
  }

  const catalog = getAllConnectorsMeta();
  const catalogIds = catalog.map((connector) => connector.id);
  if (new Set(catalogIds).size !== catalogIds.length) {
    throw new Error('Connector catalog contains duplicate ids.');
  }

  const connectorHosts = resolution.included.flatMap((includedId) => {
    const matches = catalog.filter((connector) => connector.id === includedId);
    if (matches.length !== 1) {
      throw new Error(
        `Included connector "${includedId}" must map to exactly one catalog entry; found ${matches.length}.`
      );
    }
    return [...matches[0].hostPermissions];
  });
  const expected = connectorHosts;
  if (new Set(expected).size !== expected.length) {
    throw new Error('Derived host permission contract contains duplicate patterns.');
  }
  return expected;
}

function assertExactValues(
  label: string,
  actual: readonly string[] | undefined,
  expected: readonly string[]
): void {
  const actualValues = actual ?? [];
  const actualSet = new Set(actualValues);
  const expectedSet = new Set(expected);
  const missing = expected.filter((value) => !actualSet.has(value));
  const unexpected = actualValues.filter((value) => !expectedSet.has(value));
  const duplicated = actualValues.filter((value, index) => actualValues.indexOf(value) !== index);
  if (missing.length === 0 && unexpected.length === 0 && duplicated.length === 0) {
    return;
  }
  throw new Error(
    `${label} mismatch: missing=[${missing.join(', ')}], unexpected=[${unexpected.join(', ')}], duplicated=[${duplicated.join(', ')}]`
  );
}

export function assertPackagedManifestPermissionContract(
  manifest: ManifestPermissionSurface
): void {
  assertExactValues('permissions', manifest.permissions, EXPECTED_PERMISSIONS);
  assertExactValues('host_permissions', manifest.host_permissions, getExpectedHostPermissions());
  assertExactValues(
    'optional_host_permissions',
    manifest.optional_host_permissions,
    EXPECTED_OPTIONAL_HOST_PERMISSIONS
  );
}
