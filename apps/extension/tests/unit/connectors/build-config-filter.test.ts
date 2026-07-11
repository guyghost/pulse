import { describe, it, expect } from 'vitest';
import { getConnectorIds, isConnectorIncluded } from '../../../src/lib/shell/connectors';
import { ALL_CONNECTOR_IDS } from '../../../src/lib/shell/connectors/meta';

describe('connector registry build-time filtering', () => {
  /**
   * In vitest, __PULSE_INCLUDED_CONNECTORS__ is undefined → build-config.ts
   * falls back to the full catalog. The registry therefore exposes every
   * connector. When a production build filters connectors out, the define is
   * injected and these functions hide excluded ids.
   */
  it('getConnectorIds returns all ids in test environment', () => {
    expect(getConnectorIds().sort()).toEqual([...ALL_CONNECTOR_IDS].sort());
  });

  it('isConnectorIncluded returns true for all known ids in test environment', () => {
    for (const id of ALL_CONNECTOR_IDS) {
      expect(isConnectorIncluded(id)).toBe(true);
    }
  });
});
