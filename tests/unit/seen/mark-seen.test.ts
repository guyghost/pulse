import { describe, it, expect } from 'vitest';
import { markAsSeen, MAX_SEEN_IDS } from '../../../src/lib/core/seen/mark-seen';

describe('markAsSeen', () => {
  it('merges new ids into existing set', () => {
    const result = markAsSeen(['a', 'b'], ['c', 'd']);
    expect(result).toEqual(['a', 'b', 'c', 'd']);
  });

  it('deduplicates ids', () => {
    const result = markAsSeen(['a', 'b'], ['b', 'c']);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('caps at MAX_SEEN_IDS, dropping oldest', () => {
    const existing = Array.from({ length: MAX_SEEN_IDS }, (_, i) => `id-${i}`);
    const result = markAsSeen(existing, ['new-1', 'new-2']);
    expect(result.length).toBe(MAX_SEEN_IDS);
    expect(result).toContain('new-1');
    expect(result).toContain('new-2');
    expect(result).not.toContain('id-0');
    expect(result).not.toContain('id-1');
  });

  it('returns empty array when both inputs are empty', () => {
    expect(markAsSeen([], [])).toEqual([]);
  });
});
