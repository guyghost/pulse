import { describe, it, expect } from 'vitest';
import {
  rankStacksByCount,
  computeVisibleStacks,
  computeOverflowCount,
} from '../../../../src/lib/core/filters/stack-ranking';

describe('rankStacksByCount', () => {
  it('ranks by count descending', () => {
    const counts = { Vue: 3, React: 5, Angular: 1 };
    const ranked = rankStacksByCount(counts);
    expect(ranked).toEqual(['React', 'Vue', 'Angular']);
  });

  it('tiebreaks alphabetically when counts are equal', () => {
    const counts = { Svelte: 2, React: 2, Angular: 2 };
    const ranked = rankStacksByCount(counts);
    expect(ranked).toEqual(['Angular', 'React', 'Svelte']);
  });

  it('handles empty input', () => {
    expect(rankStacksByCount({})).toEqual([]);
  });

  it('handles single stack', () => {
    expect(rankStacksByCount({ TypeScript: 10 })).toEqual(['TypeScript']);
  });
});

describe('computeVisibleStacks', () => {
  it('returns top-N stacks when no selection', () => {
    const ranked = ['A', 'B', 'C', 'D', 'E'];
    const visible = computeVisibleStacks(ranked, [], 3);
    expect(visible).toEqual(new Set(['A', 'B', 'C']));
  });

  it('pins selected stack outside top-N', () => {
    const ranked = ['A', 'B', 'C', 'D', 'E'];
    const visible = computeVisibleStacks(ranked, ['E'], 3);
    expect(visible).toEqual(new Set(['A', 'B', 'C', 'E']));
  });

  it('does not duplicate if selected is within top-N', () => {
    const ranked = ['A', 'B', 'C', 'D', 'E'];
    const visible = computeVisibleStacks(ranked, ['B'], 3);
    expect(visible).toEqual(new Set(['A', 'B', 'C']));
  });

  it('pins multiple selected stacks outside top-N', () => {
    const ranked = ['A', 'B', 'C', 'D', 'E', 'F'];
    const visible = computeVisibleStacks(ranked, ['E', 'F'], 2);
    expect(visible).toEqual(new Set(['A', 'B', 'E', 'F']));
  });

  it('handles topN larger than array length', () => {
    const ranked = ['A', 'B'];
    const visible = computeVisibleStacks(ranked, [], 10);
    expect(visible).toEqual(new Set(['A', 'B']));
  });
});

describe('computeOverflowCount', () => {
  it('returns difference when total > topN', () => {
    expect(computeOverflowCount(10, 8)).toBe(2);
  });

  it('returns 0 when total <= topN', () => {
    expect(computeOverflowCount(5, 8)).toBe(0);
    expect(computeOverflowCount(8, 8)).toBe(0);
  });

  it('returns 0 for empty list', () => {
    expect(computeOverflowCount(0, 8)).toBe(0);
  });
});
