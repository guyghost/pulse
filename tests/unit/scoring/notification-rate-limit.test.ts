import { describe, it, expect } from 'vitest';
import { canNotify, NOTIFICATION_COOLDOWN_MS } from '$lib/core/scoring/notification-rate-limit';

describe('canNotify', () => {
  it('returns true when lastNotificationTime is null (never notified)', () => {
    expect(canNotify(null, Date.now())).toBe(true);
  });

  it('returns true when cooldown has elapsed (exactly at boundary)', () => {
    const now = 1_000_000;
    const lastTime = now - NOTIFICATION_COOLDOWN_MS;
    expect(canNotify(lastTime, now)).toBe(true);
  });

  it('returns true when cooldown has elapsed (past boundary)', () => {
    const now = 1_000_000;
    const lastTime = now - NOTIFICATION_COOLDOWN_MS - 1;
    expect(canNotify(lastTime, now)).toBe(true);
  });

  it('returns false when cooldown has NOT elapsed', () => {
    const now = 1_000_000;
    const lastTime = now - NOTIFICATION_COOLDOWN_MS + 1;
    expect(canNotify(lastTime, now)).toBe(false);
  });

  it('returns false when last notification was just now', () => {
    const now = 1_000_000;
    expect(canNotify(now, now)).toBe(false);
  });

  it('returns false when last notification was in the future (clock skew)', () => {
    const now = 1_000_000;
    const lastTime = now + 10_000;
    expect(canNotify(lastTime, now)).toBe(false);
  });

  it('cooldown is 5 minutes (300000ms)', () => {
    expect(NOTIFICATION_COOLDOWN_MS).toBe(5 * 60 * 1000);
  });
});
