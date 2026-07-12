import { describe, it, expect } from 'vitest';
import {
  getConnectorsMeta,
  getAllConnectorsMeta,
  filterConnectorsByIncluded,
  ALL_CONNECTOR_IDS,
  type ConnectorMeta,
} from '../../../src/lib/shell/connectors/meta';

describe('ALL_CONNECTOR_IDS', () => {
  it('contains all six connector ids', () => {
    expect(ALL_CONNECTOR_IDS).toEqual([
      'free-work',
      'lehibou',
      'hiway',
      'collective',
      'cherry-pick',
      'malt',
    ]);
  });
});

describe('getAllConnectorsMeta', () => {
  /**
   * The unfiltered catalog is the ground truth — never affected by build config.
   * Vite.config and verify-manifest rely on it to map host_permissions.
   */
  it('returns all six connectors with hostPermissions', () => {
    const all = getAllConnectorsMeta();
    expect(all).toHaveLength(6);
    for (const c of all) {
      expect(c.hostPermissions.length).toBeGreaterThan(0);
      expect(c.hostPermissions.every((h) => h.startsWith('https://'))).toBe(true);
    }
  });

  it('each host permission pattern is owned by exactly one connector', () => {
    const all = getAllConnectorsMeta();
    const patterns: string[] = all.flatMap((c) => c.hostPermissions);
    const unique = new Set(patterns);
    expect(unique.size).toBe(patterns.length);
  });
});

describe('filterConnectorsByIncluded', () => {
  const SAMPLE: readonly ConnectorMeta[] = [
    { id: 'malt', name: 'Malt', icon: '', url: '', hostPermissions: ['https://*.malt.fr/*'] },
    { id: 'hiway', name: 'Hiway', icon: '', url: '', hostPermissions: ['https://hiway.fr/*'] },
    {
      id: 'free-work',
      name: 'Free-Work',
      icon: '',
      url: '',
      hostPermissions: ['https://fw.com/*'],
    },
  ] as const;

  it('returns all entries when includedIds matches', () => {
    const filtered = filterConnectorsByIncluded(SAMPLE, ['malt', 'hiway', 'free-work']);
    expect(filtered).toHaveLength(3);
  });

  it('keeps only entries present in includedIds', () => {
    const filtered = filterConnectorsByIncluded(SAMPLE, ['malt']);
    expect(filtered.map((c) => c.id)).toEqual(['malt']);
  });

  it('returns empty array when includedIds is empty', () => {
    expect(filterConnectorsByIncluded(SAMPLE, [])).toEqual([]);
  });

  it('preserves catalog ordering, not includedIds ordering', () => {
    const filtered = filterConnectorsByIncluded(SAMPLE, ['hiway', 'malt']);
    expect(filtered.map((c) => c.id)).toEqual(['malt', 'hiway']);
  });

  it('ignores ids in includedIds that are not in the catalog', () => {
    const filtered = filterConnectorsByIncluded(SAMPLE, ['malt', 'ghost']);
    expect(filtered.map((c) => c.id)).toEqual(['malt']);
  });
});

describe('getConnectorsMeta', () => {
  /**
   * In vitest, __PULSE_INCLUDED_CONNECTORS__ is undefined → build-config.ts
   * falls back to the full catalog. So getConnectorsMeta() returns everything.
   * This keeps tests deterministic regardless of env vars.
   */
  it('returns the full catalog in test environment', () => {
    const meta = getConnectorsMeta();
    expect(meta.map((c) => c.id)).toEqual([...ALL_CONNECTOR_IDS]);
  });
});
