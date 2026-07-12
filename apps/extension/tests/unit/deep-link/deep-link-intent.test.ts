import { describe, it, expect } from 'vitest';
import type { Mission } from '../../../src/lib/core/types/mission';
import {
  createDeepLinkIntent,
  selectFocusMissions,
  hasFocusMatch,
  formatFocusSince,
  DEEP_LINK_FOCUS_MAX,
} from '../../../src/lib/core/deep-link/deep-link-intent';

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: '1',
    title: 'Test Mission',
    client: null,
    description: '',
    stack: [],
    tjm: null,
    location: null,
    remote: null,
    duration: null,
    url: 'https://example.com',
    source: 'free-work',
    scrapedAt: new Date(),
    scoreBreakdown: null,
    score: null,
    semanticScore: null,
    semanticReason: null,
    ...overrides,
  };
}

describe('createDeepLinkIntent', () => {
  it('builds an intent from a list of mission ids', () => {
    const now = 1_000_000;
    const intent = createDeepLinkIntent(['a', 'b', 'c'], 'notification', now);
    expect(intent).toEqual({
      focusMissionIds: ['a', 'b', 'c'],
      source: 'notification',
      triggeredAt: now,
    });
  });

  it('dedupes ids preserving first-seen order (invariant I-dedupe)', () => {
    const intent = createDeepLinkIntent(['a', 'b', 'a', 'c', 'b'], 'notification', 0);
    expect(intent?.focusMissionIds).toEqual(['a', 'b', 'c']);
  });

  it('drops empty / non-string ids', () => {
    const intent = createDeepLinkIntent(['a', '', 'b'], 'digest', 0);
    expect(intent?.focusMissionIds).toEqual(['a', 'b']);
  });

  it('returns null for an empty id list (invariant I2: never emit empty intent)', () => {
    expect(createDeepLinkIntent([], 'notification', 0)).toBeNull();
  });

  it('returns null when all ids are empty strings', () => {
    expect(createDeepLinkIntent(['', '', ''], 'notification', 0)).toBeNull();
  });

  it('caps at DEEP_LINK_FOCUS_MAX, preserving the first N', () => {
    const ids = Array.from({ length: DEEP_LINK_FOCUS_MAX + 5 }, (_, i) => `m-${i}`);
    const intent = createDeepLinkIntent(ids, 'notification', 0);
    expect(intent?.focusMissionIds.length).toBe(DEEP_LINK_FOCUS_MAX);
    // First N preserved in order
    expect(intent?.focusMissionIds[0]).toBe('m-0');
    expect(intent?.focusMissionIds[DEEP_LINK_FOCUS_MAX - 1]).toBe(`m-${DEEP_LINK_FOCUS_MAX - 1}`);
  });

  it('preserves the injected `now` without calling Date.now()', () => {
    const intent = createDeepLinkIntent(['a'], 'notification', 42);
    expect(intent?.triggeredAt).toBe(42);
  });
});

describe('selectFocusMissions', () => {
  const missions = [
    makeMission({ id: 'm1' }),
    makeMission({ id: 'm2' }),
    makeMission({ id: 'm3' }),
  ];

  it('returns only missions whose id is in the intent', () => {
    const intent = createDeepLinkIntent(['m2', 'm3'], 'notification', 0)!;
    const result = selectFocusMissions(missions, intent);
    expect(result.map((m) => m.id)).toEqual(['m2', 'm3']);
  });

  it('preserves the feed order, not the intent order (stable)', () => {
    // Intent asks for m3 then m1, but feed lists m1 before m3.
    const intent = createDeepLinkIntent(['m3', 'm1'], 'notification', 0)!;
    const result = selectFocusMissions(missions, intent);
    expect(result.map((m) => m.id)).toEqual(['m1', 'm3']);
  });

  it('returns an empty array when no mission matches', () => {
    const intent = createDeepLinkIntent(['missing'], 'notification', 0)!;
    expect(selectFocusMissions(missions, intent)).toEqual([]);
  });

  it('ignores intent ids not present in the feed', () => {
    const intent = createDeepLinkIntent(['m1', 'ghost', 'm2'], 'notification', 0)!;
    const result = selectFocusMissions(missions, intent);
    expect(result.map((m) => m.id)).toEqual(['m1', 'm2']);
  });
});

describe('hasFocusMatch', () => {
  const missions = [makeMission({ id: 'm1' }), makeMission({ id: 'm2' })];

  it('returns true when at least one intent id is present', () => {
    const intent = createDeepLinkIntent(['m1', 'missing'], 'notification', 0)!;
    expect(hasFocusMatch(missions, intent)).toBe(true);
  });

  it('returns false when no intent id is present', () => {
    const intent = createDeepLinkIntent(['ghost'], 'notification', 0)!;
    expect(hasFocusMatch(missions, intent)).toBe(false);
  });

  it('returns false for a null intent', () => {
    expect(hasFocusMatch(missions, null)).toBe(false);
  });
});

describe('formatFocusSince', () => {
  const now = 10 * 60 * 1000; // 10 min epoch ms

  it('returns "à l’instant" for a delta under 45s', () => {
    expect(formatFocusSince(now - 30_000, now)).toBe('à l’instant');
  });

  it('returns "à l’instant" for a zero delta', () => {
    expect(formatFocusSince(now, now)).toBe('à l’instant');
  });

  it('returns "à l’instant" for a negative / non-finite delta (clock skew)', () => {
    expect(formatFocusSince(now + 5_000, now)).toBe('à l’instant');
  });

  it('returns "il y a 1 min" for ~1 min', () => {
    expect(formatFocusSince(now - 60_000, now)).toBe('il y a 1 min');
  });

  it('returns "il y a N min" for minutes < 60', () => {
    expect(formatFocusSince(now - 5 * 60_000, now)).toBe('il y a 5 min');
  });

  it('returns "il y a 1 h" for ~1 hour', () => {
    expect(formatFocusSince(now - 60 * 60 * 1000, now)).toBe('il y a 1 h');
  });

  it('returns "il y a N h" for hours < 24', () => {
    expect(formatFocusSince(now - 3 * 60 * 60 * 1000, now)).toBe('il y a 3 h');
  });

  it('returns "hier" for ~1 day', () => {
    expect(formatFocusSince(now - 24 * 60 * 60 * 1000, now)).toBe('hier');
  });

  it('returns "il y a N j" for multiple days', () => {
    expect(formatFocusSince(now - 3 * 24 * 60 * 60 * 1000, now)).toBe('il y a 3 j');
  });
});
