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
  it('counts stacks outside the visible set', () => {
    const visible = new Set(['A', 'B', 'C']);
    expect(computeOverflowCount(['A', 'B', 'C', 'D', 'E'], visible)).toBe(2);
  });

  it('returns 0 when all available stacks are visible', () => {
    const visible = new Set(['A', 'B', 'C']);
    expect(computeOverflowCount(['A', 'B', 'C'], visible)).toBe(0);
  });

  it('returns 0 for an empty available list', () => {
    expect(computeOverflowCount([], new Set())).toBe(0);
  });

  it('does not overcount pinned selected stacks (all pinned → 0 overflow)', () => {
    // 5 ranked stacks, top-3 = {A,B,C}; selected pins D and E → all visible.
    const visible = new Set(['A', 'B', 'C', 'D', 'E']);
    expect(computeOverflowCount(['A', 'B', 'C', 'D', 'E'], visible)).toBe(0);
  });

  it('counts only truly hidden stacks when some selected are pinned', () => {
    // 5 ranked, top-3 = {A,B,C}; selected pins E → visible {A,B,C,E}; hidden = D.
    const visible = new Set(['A', 'B', 'C', 'E']);
    expect(computeOverflowCount(['A', 'B', 'C', 'D', 'E'], visible)).toBe(1);
  });
});
