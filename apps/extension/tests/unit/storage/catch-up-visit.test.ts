import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MIN_BRIEFING_INTERVAL_MS } from '../../../src/lib/core/feed/catch-up-briefing';
import {
  getLastVisitAt,
  setLastVisitAt,
  touchLastVisitAt,
} from '../../../src/lib/shell/storage/catch-up-visit';

const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn((keys: string[]) =>
        Promise.resolve(Object.fromEntries(keys.map((k) => [k, mockStorage[k]])))
      ),
      set: vi.fn((obj: Record<string, unknown>) => {
        Object.assign(mockStorage, obj);
        return Promise.resolve();
      }),
    },
  },
});

describe('catch-up-visit storage', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  });

  it('returns null when no baseline has ever been stored', async () => {
    expect(await getLastVisitAt()).toBeNull();
  });

  it('returns null for a corrupt stored value', async () => {
    mockStorage['lastVisitAt'] = 'not-a-number';
    expect(await getLastVisitAt()).toBeNull();
    mockStorage['lastVisitAt'] = -5;
    expect(await getLastVisitAt()).toBeNull();
  });

  it('stores and retrieves a baseline timestamp', async () => {
    const now = new Date('2026-09-22T12:00:00.000Z');
    await setLastVisitAt(now);
    const read = await getLastVisitAt();
    expect(read?.getTime()).toBe(now.getTime());
  });

  it('writes when there is no previous baseline', async () => {
    const now = new Date('2026-09-22T12:00:00.000Z');
    expect(await touchLastVisitAt(now)).toBe(true);
    expect((await getLastVisitAt())?.getTime()).toBe(now.getTime());
  });

  it('advances the baseline when the interval exceeds 30 minutes', async () => {
    await setLastVisitAt(new Date('2026-09-22T10:00:00.000Z'));
    const later = new Date('2026-09-22T12:00:00.000Z');
    expect(await touchLastVisitAt(later)).toBe(true);
    expect((await getLastVisitAt())?.getTime()).toBe(later.getTime());
  });

  it('keeps the baseline when the reopen is under the 30-minute threshold', async () => {
    const original = new Date('2026-09-22T12:00:00.000Z');
    await setLastVisitAt(original);
    const soon = new Date(original.getTime() + MIN_BRIEFING_INTERVAL_MS - 1000);
    expect(await touchLastVisitAt(soon)).toBe(false);
    expect((await getLastVisitAt())?.getTime()).toBe(original.getTime());
  });
});
