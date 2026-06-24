import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAlertHistory,
  getAlertHistory,
  recordAlertHistoryEntry,
} from '../../../src/lib/shell/storage/alert-history';
import type { AlertHistoryEntry } from '../../../src/lib/core/types/alert-history';

const mockStorage: Record<string, unknown> = {};
const ALERT_HISTORY_KEY = 'missionpulse.alertHistory';

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      }),
      remove: vi.fn(async (key: string) => {
        delete mockStorage[key];
      }),
    },
  },
});

function makeHistoryEntry(overrides: Partial<AlertHistoryEntry> = {}): AlertHistoryEntry {
  return {
    id: 'alert-1',
    triggeredAt: 1_779_436_800_000,
    missionCount: 1,
    missionIds: ['mission-1'],
    missionTitles: ['Mission Svelte'],
    scoreThreshold: 80,
    minDailyRate: 650,
    requiredStacks: ['Svelte'],
    maxResults: 5,
    ...overrides,
  };
}

describe('alert history storage', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  });

  it('stores newest alert history first', async () => {
    await recordAlertHistoryEntry(makeHistoryEntry({ id: 'old', triggeredAt: 1000 }));
    await recordAlertHistoryEntry(makeHistoryEntry({ id: 'new', triggeredAt: 2000 }));

    await expect(getAlertHistory()).resolves.toMatchObject([
      { id: 'new', triggeredAt: 2000 },
      { id: 'old', triggeredAt: 1000 },
    ]);
  });

  it('keeps only the latest 20 entries', async () => {
    for (let index = 0; index < 25; index += 1) {
      await recordAlertHistoryEntry(
        makeHistoryEntry({ id: `alert-${index}`, triggeredAt: 1000 + index })
      );
    }

    const history = await getAlertHistory();

    expect(history).toHaveLength(20);
    expect(history[0]?.id).toBe('alert-24');
    expect(history.at(-1)?.id).toBe('alert-5');
  });

  it('returns empty history for invalid stored data', async () => {
    mockStorage[ALERT_HISTORY_KEY] = [{ id: '', triggeredAt: -1 }];

    await expect(getAlertHistory()).resolves.toEqual([]);
  });

  it('removes the alert history key', async () => {
    mockStorage[ALERT_HISTORY_KEY] = [makeHistoryEntry()];

    await clearAlertHistory();

    expect(mockStorage[ALERT_HISTORY_KEY]).toBeUndefined();
  });
});
