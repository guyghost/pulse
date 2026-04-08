/**
 * Fuse deterministic score and semantic score into a final score.
 *
 * Strategy:
 * - If only deterministic: use it (100% weight)
 * - If only semantic: use it (100% weight)
 * - If both: weighted average (default: 60% deterministic, 40% semantic)
 * - If neither: null
 *
 * The weights are configurable via the `semanticWeight` parameter (0-1).
 * semanticWeight=0.4 means 40% semantic, 60% deterministic.
 *
 * @param deterministicScore - Score from rule-based matching (0-100 or null)
 * @param semanticScore - Score from LLM semantic analysis (0-100 or null)
 * @param semanticWeight - Weight for semantic score (0-1), default 0.4
 * @returns Combined final score (0-100) or null if both inputs are null
 */
export const computeFinalScore = (
  deterministicScore: number | null,
  semanticScore: number | null,
  semanticWeight = 0.4
): number | null => {
  // If neither score exists, return null
  if (deterministicScore === null && semanticScore === null) {
    return null;
  }

  // If only deterministic exists, use it
  if (semanticScore === null) {
    // At this point, deterministicScore is guaranteed non-null
    // (otherwise we would have returned in the first check)
    return clampScore(deterministicScore as number);
  }

  // If only semantic exists, use it
  if (deterministicScore === null) {
    return clampScore(semanticScore);
  }

  // Both exist: weighted average
  const deterministicWeight = 1 - semanticWeight;
  const rawScore = deterministicScore * deterministicWeight + semanticScore * semanticWeight;

  return Math.round(clampScore(rawScore));
};

/**
 * Clamp a score to the valid 0-100 range.
 * Pure function with no side effects.
 */
const clampScore = (score: number): number => Math.max(0, Math.min(100, score));
