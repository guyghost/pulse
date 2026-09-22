import type { Mission } from '../types/mission';
import { formatTJM } from '../utils/format';
import { getMissionScore } from './mission-grade';

export interface TopMatchSignals {
  /** True when mission qualifies as a top match (Grade A, score >= 85). */
  isTopMatch: boolean;
  /** Canonical numeric score (0-100) or null. */
  score: number | null;
  /** Up to 3 concise highlight strings explaining why it matches. */
  highlights: string[];
}

export interface TopMatchSignalsOptions {
  /** Minimum profile floor daily rate for comparing TJM. */
  profileTjmMin?: number | null;
  /** Score threshold to qualify as top match (defaults to 85 per proposal #210). */
  threshold?: number;
}

/**
 * Derives top match signals and key conversion highlights for a mission.
 * Pure core function: zero I/O, zero async, strictly deterministic.
 */
export function deriveTopMatchSignals(
  mission: Mission,
  options: TopMatchSignalsOptions = {}
): TopMatchSignals {
  const threshold = options.threshold ?? 85;
  const score = getMissionScore(mission);
  const isTopMatch = typeof score === 'number' && score >= threshold;

  const highlights: string[] = [];

  // 1. Stack match
  const stackScore = mission.scoreBreakdown?.criteria.stack;
  if (typeof stackScore === 'number') {
    if (stackScore >= 85) {
      highlights.push('Compétences clés maîtrisées');
    } else if (stackScore >= 60) {
      highlights.push('Bonne affinité compétences');
    }
  } else if (mission.stack.length > 0) {
    const topTechs = mission.stack.slice(0, 2).join(', ');
    highlights.push(`Stack : ${topTechs}`);
  }

  // 2. TJM positioning vs profile floor
  const effectiveTjm = mission.tjm ?? mission.tjmMin ?? null;
  const floor = options.profileTjmMin;

  if (typeof effectiveTjm === 'number' && typeof floor === 'number' && floor > 0) {
    const diff = effectiveTjm - floor;
    if (diff > 0) {
      const pct = Math.round((diff / floor) * 100);
      highlights.push(`+${pct}% vs plancher (${formatTJM(effectiveTjm)})`);
    } else if (diff === 0) {
      highlights.push(`TJM aligné au plancher (${formatTJM(effectiveTjm)})`);
    }
  } else if (typeof effectiveTjm === 'number' && effectiveTjm > 0) {
    highlights.push(`${formatTJM(effectiveTjm)} annoncé`);
  }

  // 3. Remote / location flexibility
  if (mission.remote === 'full') {
    highlights.push('100% télétravail');
  } else if (mission.remote === 'hybrid') {
    highlights.push('Télétravail hybride');
  } else if (mission.classification?.remoteCompatible) {
    highlights.push('Remote compatible');
  } else if (mission.location) {
    highlights.push(mission.location);
  }

  // 4. Client / Start date bonus fallback if fewer than 3 highlights
  if (highlights.length < 3) {
    if (mission.client) {
      highlights.push(mission.client);
    } else if (
      mission.scoreBreakdown?.criteria.startDateBonus &&
      mission.scoreBreakdown.criteria.startDateBonus > 0
    ) {
      highlights.push('Démarrage immédiat');
    }
  }

  return {
    isTopMatch,
    score,
    highlights: highlights.slice(0, 3),
  };
}
