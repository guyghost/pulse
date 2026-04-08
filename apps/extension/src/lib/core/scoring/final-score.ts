import type { ScoreBreakdown } from '../types/score';
import { scoreToGrade } from '../types/score';
import type { DeterministicBreakdown } from '../types/score';

/**
 * Build a complete ScoreBreakdown from deterministic scoring results.
 *
 * Used when semantic scoring is not available (Gemini Nano absent or timed out).
 *
 * @param deterministicTotal - Score from rule-based matching (0-100)
 * @param breakdown - Per-criterion breakdown
 * @returns Complete ScoreBreakdown with null semantic scores
 */
export const buildScoreBreakdown = (
  deterministicTotal: number,
  breakdown: DeterministicBreakdown
): ScoreBreakdown => {
  const total = clampScore(deterministicTotal);
  return {
    criteria: breakdown,
    deterministic: total,
    semantic: null,
    semanticReason: null,
    total,
    grade: scoreToGrade(total),
  };
};

/**
 * Fuse deterministic and semantic scores into a final ScoreBreakdown.
 *
 * Strategy:
 * - If only deterministic: use it (100% weight)
 * - If only semantic: use it (100% weight)
 * - If both: weighted average (default: 60% deterministic, 40% semantic)
 *
 * @param deterministicTotal - Score from rule-based matching (0-100)
 * @param breakdown - Per-criterion breakdown
 * @param semanticScore - Score from LLM semantic analysis (0-100 or null)
 * @param semanticReason - LLM explanation (or null)
 * @param semanticWeight - Weight for semantic score (0-1), default 0.4
 * @returns Complete ScoreBreakdown with fused score and grade
 */
export const computeFinalBreakdown = (
  deterministicTotal: number,
  breakdown: DeterministicBreakdown,
  semanticScore: number | null,
  semanticReason: string | null,
  semanticWeight = 0.4
): ScoreBreakdown => {
  const det = clampScore(deterministicTotal);

  // No semantic score available — deterministic only
  if (semanticScore === null) {
    return {
      criteria: breakdown,
      deterministic: det,
      semantic: null,
      semanticReason: null,
      total: det,
      grade: scoreToGrade(det),
    };
  }

  const sem = clampScore(semanticScore);

  // Weighted fusion
  const deterministicWeight = 1 - semanticWeight;
  const fused = Math.round(clampScore(det * deterministicWeight + sem * semanticWeight));

  return {
    criteria: breakdown,
    deterministic: det,
    semantic: sem,
    semanticReason,
    total: fused,
    grade: scoreToGrade(fused),
  };
};

/**
 * Legacy helper: compute a single numeric final score.
 * Used for backward compatibility during migration.
 *
 * @deprecated Use computeFinalBreakdown() instead.
 */
export const computeFinalScore = (
  deterministicScore: number | null,
  semanticScore: number | null,
  semanticWeight = 0.4
): number | null => {
  if (deterministicScore === null && semanticScore === null) {
    return null;
  }
  if (semanticScore === null) {
    return clampScore(deterministicScore as number);
  }
  if (deterministicScore === null) {
    return clampScore(semanticScore);
  }
  const deterministicWeight = 1 - semanticWeight;
  const rawScore = deterministicScore * deterministicWeight + semanticScore * semanticWeight;
  return Math.round(clampScore(rawScore));
};

/**
 * Clamp a score to the valid 0-100 range.
 * Pure function with no side effects.
 */
const clampScore = (score: number): number => Math.max(0, Math.min(100, score));
