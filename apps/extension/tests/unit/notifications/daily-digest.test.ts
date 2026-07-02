import { describe, it, expect } from 'vitest';
import { nextDigestTime, DIGEST_HOUR } from '../../../src/lib/shell/notifications/daily-digest';

describe('nextDigestTime', () => {
  it('returns today at DIGEST_HOUR if that time has not passed yet', () => {
    // 6 AM → digest at 9 AM today
    const now = new Date('2026-07-01T06:00:00');
    const result = nextDigestTime(now);
    const expected = new Date('2026-07-01T09:00:00').getTime();
    expect(result).toBe(expected);
  });

  it('returns tomorrow at DIGEST_HOUR if that time has already passed', () => {
    // 11 AM → digest at 9 AM tomorrow
    const now = new Date('2026-07-01T11:00:00');
    const result = nextDigestTime(now);
    const expected = new Date('2026-07-02T09:00:00').getTime();
    expect(result).toBe(expected);
  });

  it('returns tomorrow when called exactly at DIGEST_HOUR', () => {
    // Exactly 9 AM → already passed, schedule tomorrow
    const now = new Date('2026-07-01T09:00:00');
    const result = nextDigestTime(now);
    const expected = new Date('2026-07-02T09:00:00').getTime();
    expect(result).toBe(expected);
  });

  it('handles midnight (before DIGEST_HOUR)', () => {
    const now = new Date('2026-07-01T00:00:00');
    const result = nextDigestTime(now);
    const expected = new Date('2026-07-01T09:00:00').getTime();
    expect(result).toBe(expected);
  });

  it('handles late evening (after DIGEST_HOUR)', () => {
    const now = new Date('2026-07-01T23:59:00');
    const result = nextDigestTime(now);
    const expected = new Date('2026-07-02T09:00:00').getTime();
    expect(result).toBe(expected);
  });

  it('uses DIGEST_HOUR constant (9)', () => {
    expect(DIGEST_HOUR).toBe(9);
  });

  it('respects local time (not UTC)', () => {
    // This test documents that nextDigestTime uses local time via setHours.
    // The hour set is DIGEST_HOUR in the local timezone of the runtime.
    const now = new Date('2026-07-01T06:00:00');
    const resultDate = new Date(nextDigestTime(now));
    expect(resultDate.getHours()).toBe(DIGEST_HOUR);
  });
});
