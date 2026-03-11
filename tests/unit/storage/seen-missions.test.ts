import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSeenIds, saveSeenIds } from '../../../src/lib/shell/storage/seen-missions';

const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn((keys: string[]) => Promise.resolve(
        Object.fromEntries(keys.map(k => [k, mockStorage[k]]))
      )),
      set: vi.fn((obj: Record<string, unknown>) => {
        Object.assign(mockStorage, obj);
        return Promise.resolve();
      }),
    },
  },
});

describe('seen-missions storage', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  });

  it('returns empty array when no data stored', async () => {
    const result = await getSeenIds();
    expect(result).toEqual([]);
  });

  it('saves and retrieves seen ids', async () => {
    await saveSeenIds(['a', 'b', 'c']);
    mockStorage['seenMissionIds'] = ['a', 'b', 'c'];
    const result = await getSeenIds();
    expect(result).toEqual(['a', 'b', 'c']);
  });
});
