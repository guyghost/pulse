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

  // ---------------------------------------------------------------------------
  // Boundary condition tests for pruning reliability
  // ---------------------------------------------------------------------------

  it('preserves exactly MAX_SEEN_IDS when exactly at limit', () => {
    const exactlyAtLimit = Array.from({ length: MAX_SEEN_IDS }, (_, i) => `id-${i}`);
    const result = markAsSeen(exactlyAtLimit, []);
    expect(result.length).toBe(MAX_SEEN_IDS);
    // No items should be dropped when at limit with no new items
    expect(result[0]).toBe('id-0');
    expect(result[MAX_SEEN_IDS - 1]).toBe(`id-${MAX_SEEN_IDS - 1}`);
  });

  it('drops exactly one oldest when exceeding limit by one', () => {
    const atLimit = Array.from({ length: MAX_SEEN_IDS }, (_, i) => `id-${i}`);
    const result = markAsSeen(atLimit, ['new-1']);
    expect(result.length).toBe(MAX_SEEN_IDS);
    expect(result).toContain('new-1');
    expect(result).not.toContain('id-0'); // Oldest dropped
    expect(result).toContain('id-1'); // Second oldest kept
  });

  it('drops correct number of oldest when adding many new ids', () => {
    const halfLimit = Math.floor(MAX_SEEN_IDS / 2);
    const existing = Array.from({ length: halfLimit }, (_, i) => `old-${i}`);
    const newIds = Array.from({ length: halfLimit + 10 }, (_, i) => `new-${i}`);
    
    const result = markAsSeen(existing, newIds);
    
    expect(result.length).toBe(MAX_SEEN_IDS);
    // Should drop oldest from existing to make room
    const oldIdsKept = result.filter(id => id.startsWith('old-'));
    const newIdsKept = result.filter(id => id.startsWith('new-'));
    expect(oldIdsKept.length + newIdsKept.length).toBe(MAX_SEEN_IDS);
  });

  it('handles large number of duplicates correctly', () => {
    const existing = Array.from({ length: MAX_SEEN_IDS }, (_, i) => `id-${i}`);
    // All new ids are duplicates
    const newIds = Array.from({ length: 100 }, (_, i) => `id-${i}`);
    
    const result = markAsSeen(existing, newIds);
    
    expect(result.length).toBe(MAX_SEEN_IDS);
    // No items dropped since all were duplicates
    expect(result[0]).toBe('id-0');
  });

  it('preserves insertion order (oldest first, newest last)', () => {
    const result = markAsSeen(['a', 'b', 'c'], ['d', 'e']);
    expect(result).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('maintains order when pruning (keeps newest MAX_SEEN_IDS)', () => {
    const existing = Array.from({ length: MAX_SEEN_IDS + 100 }, (_, i) => `id-${i}`);
    // Simulate a case where existing already exceeds limit (shouldn't happen in practice but test resilience)
    const result = markAsSeen(existing, ['new-1']);
    
    expect(result.length).toBe(MAX_SEEN_IDS);
    // Newest items should be at the end
    expect(result[result.length - 1]).toBe('new-1');
  });

  it('handles single id additions at boundary correctly', () => {
    // Build up to limit one by one
    let current: string[] = [];
    for (let i = 0; i < MAX_SEEN_IDS + 50; i++) {
      current = markAsSeen(current, [`id-${i}`]);
    }
    
    expect(current.length).toBe(MAX_SEEN_IDS);
    // Should have the newest MAX_SEEN_IDS
    expect(current).toContain(`id-${MAX_SEEN_IDS + 49}`);
    expect(current).not.toContain('id-0');
    expect(current).not.toContain(`id-${49}`);
  });

  it('MAX_SEEN_IDS constant is documented', () => {
    // This test documents the current limit
    // Must match shell/storage/seen-missions.ts limit
    expect(MAX_SEEN_IDS).toBe(2000);
  });
});
