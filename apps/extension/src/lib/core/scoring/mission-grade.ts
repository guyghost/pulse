import type { Mission } from '../types/mission';
import { scoreToGrade, type Grade } from '../types/score';

/**
 * Returns the canonical numeric score used to present and rank a mission.
 *
 * Structured scores win over legacy fields. Historical semantic scores keep
 * their existing precedence over deterministic legacy scores, matching the
 * mission sorting contract.
 */
export function getMissionScore(mission: Mission): number | null {
  const score = mission.scoreBreakdown?.total ?? mission.semanticScore ?? mission.score ?? null;

  return typeof score === 'number' && Number.isFinite(score) ? score : null;
}

/**
 * Projects a mission's canonical numeric score to its user-facing letter.
 * An unscored mission remains unrated instead of being presented as F.
 */
export function getMissionGrade(mission: Mission): Grade | null {
  const score = getMissionScore(mission);
  return score === null ? null : scoreToGrade(score);
}
