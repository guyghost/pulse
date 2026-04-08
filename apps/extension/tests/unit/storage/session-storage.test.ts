import { describe, it, expect, vi, beforeEach } from 'vitest';

const sessionStore: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    session: {
      get: vi.fn(async (keys: string[]) => {
        const result: Record<string, unknown> = {};
        for (const k of keys) {
          if (k in sessionStore) {
            result[k] = sessionStore[k];
          }
        }
        return result;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(sessionStore, items);
      }),
    },
  },
});

import {
  getScanState,
  setScanState,
  getNewMissionCount,
  setNewMissionCount,
  resetNewMissionCount,
} from '../../../src/lib/shell/storage/session-storage';

describe('session-storage', () => {
  beforeEach(() => {
    for (const key of Object.keys(sessionStore)) {
      delete sessionStore[key];
    }
  });

  it('returns idle scan state by default', async () => {
    expect(await getScanState()).toBe('idle');
  });

  it('persists scan state', async () => {
    await setScanState('scanning');
    expect(await getScanState()).toBe('scanning');
  });

  it('returns 0 new missions by default', async () => {
    expect(await getNewMissionCount()).toBe(0);
  });

  it('persists and resets new mission count', async () => {
    await setNewMissionCount(5);
    expect(await getNewMissionCount()).toBe(5);
    await resetNewMissionCount();
    expect(await getNewMissionCount()).toBe(0);
  });
});
