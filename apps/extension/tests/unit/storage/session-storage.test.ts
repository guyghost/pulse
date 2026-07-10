import { describe, it, expect, vi, beforeEach } from 'vitest';

const sessionStore: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    session: {
      get: vi.fn(async (keys: string | string[]) => {
        const keyList = typeof keys === 'string' ? [keys] : keys;
        const result: Record<string, unknown> = {};
        for (const k of keyList) {
          if (k in sessionStore) {
            result[k] = sessionStore[k];
          }
        }
        return result;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(sessionStore, items);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const keyList = typeof keys === 'string' ? [keys] : keys;
        for (const k of keyList) {
          delete sessionStore[k];
        }
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
  setDeepLinkIntent,
  consumeDeepLinkIntent,
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

  it('hands a pending intent to exactly one concurrent consumer', async () => {
    const intent = {
      focusMissionIds: ['m1', 'm2'],
      source: 'notification' as const,
      triggeredAt: 1_700_000_000_000,
    };
    await setDeepLinkIntent(intent);

    // Two CONSUME requests racing in the same service worker (two panel
    // windows). The module mutex must serialize them so only the first wins.
    const [first, second] = await Promise.all([consumeDeepLinkIntent(), consumeDeepLinkIntent()]);

    expect(first ?? second).toEqual(intent);
    expect(first ? second : first).toBeNull();
  });
});
