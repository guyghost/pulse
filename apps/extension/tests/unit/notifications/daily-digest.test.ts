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

  it('advances by calendar day (getDate+1), not a fixed 24h offset', () => {
    // Regression guard for DST drift: the result must land on the next calendar
    // day at DIGEST_HOUR in local time. Adding a fixed 24h would land on the
    // wrong local hour on DST changeovers (23h/25h days).
    const now = new Date('2026-07-01T11:00:00');
    const resultDate = new Date(nextDigestTime(now));
    expect(resultDate.getHours()).toBe(DIGEST_HOUR);
    expect(resultDate.getMinutes()).toBe(0);
    expect(resultDate.getDate()).toBe(now.getDate() + 1);
  });

  it('pins DIGEST_HOUR across a DST boundary (spring-forward)', () => {
    // US DST 2026 spring-forward is Sun Mar 8 at 2:00 local. The day before,
    // scheduling past today's DIGEST_HOUR must still return 9:00 local tomorrow,
    // not 10:00. On non-DST runners (e.g. UTC) this reduces to the same local
    // hour and still passes.
    const now = new Date('2026-03-07T11:00:00');
    const resultDate = new Date(nextDigestTime(now));
    expect(resultDate.getHours()).toBe(DIGEST_HOUR);
    expect(resultDate.getDate()).toBe(8);
  });

  it('pins DIGEST_HOUR across a DST boundary (fall-back)', () => {
    // US DST 2026 fall-back is Sun Nov 1 at 2:00 local. Scheduling from the
    // prior evening must return 9:00 local on Nov 1, not 8:00.
    const now = new Date('2026-10-31T23:00:00');
    const resultDate = new Date(nextDigestTime(now));
    expect(resultDate.getHours()).toBe(DIGEST_HOUR);
    expect(resultDate.getDate()).toBe(1);
  });
});
