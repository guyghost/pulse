import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../src/lib/shell/storage/chrome-storage';
import { ALL_CONNECTOR_IDS } from '../../../src/lib/shell/connectors/meta';

describe('DEFAULT_SETTINGS.enabledConnectors', () => {
  /**
   * Default enabled connectors must track the build-time included set so an
   * excluded connector (e.g. malt) never appears as "enabled" out of the box.
   * In vitest, build-config falls back to the full catalog, so we expect all
   * six ids.
   */
  it('matches the full connector catalog in test environment', () => {
    expect(DEFAULT_SETTINGS.enabledConnectors.sort()).toEqual([...ALL_CONNECTOR_IDS].sort());
  });

  it('does not contain duplicates', () => {
    const ids = DEFAULT_SETTINGS.enabledConnectors;
    expect(new Set(ids).size).toBe(ids.length);
  });
});
