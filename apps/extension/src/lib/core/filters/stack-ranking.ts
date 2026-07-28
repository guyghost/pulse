/**
 * Stack ranking utilities — pure functions for ranking and selecting
 * technology stacks by frequency, with stable sorting and selected-pinning.
 */

export interface StackCount {
  stack: string;
  count: number;
}

/**
 * Ranks stacks by count descending, tiebreak alphabetically for determinism.
 */
export function rankStacksByCount(stackCounts: Record<string, number>): string[] {
  return Object.entries(stackCounts)
    .sort((a, b) => {
      const countDiff = b[1] - a[1];
      if (countDiff !== 0) {
        return countDiff;
      }
      // Stable tiebreak: alphabetical
      return a[0].localeCompare(b[0]);
    })
    .map(([stack]) => stack);
}

/**
 * Computes the visible stack set: top-N by rank + any selected stacks
 * outside the top-N (pinned).
 *
 * Returns a Set for O(1) membership checks.
 */
export function computeVisibleStacks(
  rankedStacks: string[],
  selectedStacks: string[],
  topN: number
): Set<string> {
  const visible = new Set(rankedStacks.slice(0, topN));
  for (const selected of selectedStacks) {
    visible.add(selected);
  }
  return visible;
}

/**
 * Returns the overflow count: total - top-N, clamped to ≥0.
 * Does NOT subtract pinned selected stacks (they're bonus visibility).
 */
export function computeOverflowCount(totalStacks: number, topN: number): number {
  return Math.max(0, totalStacks - topN);
}
