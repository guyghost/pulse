import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      }),
      remove: vi.fn(async () => {}),
    },
  },
});

import { getSettings } from '../../../src/lib/shell/storage/chrome-storage';

describe('getSettings', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  });

  it('returns defaults with autoScan true', async () => {
    const settings = await getSettings();
    expect(settings.autoScan).toBe(true);
    expect(settings.scanIntervalMinutes).toBe(30);
  });
});
