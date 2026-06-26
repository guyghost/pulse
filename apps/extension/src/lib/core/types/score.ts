/**
 * Structured score types for mission evaluation.
 *
 * Breaks down the scoring into individual criteria,
 * provides letter grades, and supports fusion with semantic scoring.
 */

/**
 * Letter grade derived from a 0-100 score.
 *
 * A = 80-100 : Excellent match
 * B = 60-79  : Good match
 * C = 40-59  : Partial match
 * D = 20-39  : Weak match
 * F = 0-19   : No match
 */
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Breakdown of deterministic (rule-based) scoring by criterion.
 * Each criterion is a match percentage 0-100 (unweighted),
 * directly gradable via scoreToGrade().
 * Bonuses are 0-10.
 */
export interface DeterministicBreakdown {
  /** Stack technology overlap match % (0-100) */
  stack: number;
  /** Location match % (0-100) */
  location: number;
  /** TJM (daily rate) fit match % (0-100) */
  tjm: number;
  /** Work mode (remote/hybrid/onsite) match % (0-100) */
  remote: number;
  /** Seniority level match bonus (0-5) */
  seniorityBonus: number;
  /** Start date urgency bonus (0-5) */
  startDateBonus: number;
}

/**
 * Complete scored result for a mission.
 * Includes deterministic breakdown, optional semantic score, and final fused score.
 */
export interface ScoreBreakdown {
  /** Individual criterion scores (weighted, before bonuses) */
  criteria: DeterministicBreakdown;
  /** Raw deterministic total (0-100, after bonuses, clamped) */
  deterministic: number;
  /** LLM-based semantic score (0-100), null if unavailable */
  semantic: number | null;
  /** LLM-based semantic explanation, null if unavailable */
  semanticReason: string | null;
  /** Fused final score (0-100), combining deterministic + semantic */
  total: number;
  /** Letter grade derived from the total score */
  grade: Grade;
}

/**
 * Convert a numeric score (0-100) to a letter grade.
 * Pure function — no I/O, no side effects.
 */
export function scoreToGrade(score: number): Grade {
  if (score >= 80) {
    return 'A';
  }
  if (score >= 60) {
    return 'B';
  }
  if (score >= 40) {
    return 'C';
  }
  if (score >= 20) {
    return 'D';
  }
  return 'F';
}

/**
 * Grade to color mapping for UI display.
 * Matches the existing design tokens.
 */
export const GRADE_COLORS: Record<Grade, { text: string; bg: string }> = {
  A: { text: 'text-accent-emerald', bg: 'bg-accent-emerald/15' },
  B: { text: 'text-accent-blue', bg: 'bg-accent-blue/15' },
  C: { text: 'text-accent-amber', bg: 'bg-accent-amber/15' },
  D: { text: 'text-text-muted', bg: 'bg-white/5' },
  F: { text: 'text-text-muted', bg: 'bg-white/5' },
};
