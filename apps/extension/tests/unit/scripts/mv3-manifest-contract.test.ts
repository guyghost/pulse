import { describe, expect, it } from 'vitest';
import {
  assertPackagedManifestPermissionContract,
  getExpectedHostPermissions,
  NON_CONNECTOR_HOST_PERMISSIONS,
  EXPECTED_OPTIONAL_HOST_PERMISSIONS,
  EXPECTED_PERMISSIONS,
} from '../../mv3/manifest-contract';

function validManifest() {
  return {
    permissions: [...EXPECTED_PERMISSIONS],
    host_permissions: getExpectedHostPermissions(),
    optional_host_permissions: [...EXPECTED_OPTIONAL_HOST_PERMISSIONS],
  };
}

describe('packaged MV3 manifest permission contract', () => {
  it('accepts only the release permission surface', () => {
    expect(() => assertPackagedManifestPermissionContract(validManifest())).not.toThrow();
  });

  it('derives connector hosts from file/env resolution while preserving explicit feature hosts', () => {
    expect(
      getExpectedHostPermissions({
        config: { include: ['free-work'] },
        env: {},
      })
    ).toEqual(['https://www.free-work.com/*', ...NON_CONNECTOR_HOST_PERMISSIONS]);
    expect(
      getExpectedHostPermissions({
        config: { include: ['free-work'] },
        env: { CONNECTORS_INCLUDE: 'lehibou' },
      })
    ).toEqual(['https://*.lehibou.com/*', ...NON_CONNECTOR_HOST_PERMISSIONS]);
    expect(
      getExpectedHostPermissions({
        config: {},
        env: { CONNECTORS_EXCLUDE: 'hiway' },
      })
    ).not.toContain('https://hiway-missions.fr/*');
  });

  it('fails closed when connector resolution contains an unknown id', () => {
    expect(() =>
      getExpectedHostPermissions({
        config: {},
        env: { CONNECTORS_INCLUDE: 'unknown' },
      })
    ).toThrow(/Unknown connector id/);
  });

  it('rejects an unexpected privileged permission', () => {
    expect(() =>
      assertPackagedManifestPermissionContract({
        ...validManifest(),
        permissions: [...EXPECTED_PERMISSIONS, 'tabs'],
      })
    ).toThrow(/permissions.*tabs/);
  });

  it('rejects missing, duplicated, or unexpected host permissions', () => {
    expect(() =>
      assertPackagedManifestPermissionContract({
        ...validManifest(),
        host_permissions: [...getExpectedHostPermissions(), 'https://unexpected.example/*'],
      })
    ).toThrow(/host_permissions.*unexpected\.example/);
    expect(() =>
      assertPackagedManifestPermissionContract({
        ...validManifest(),
        optional_host_permissions: [],
      })
    ).toThrow(/optional_host_permissions.*linkedin/);
  });
});
