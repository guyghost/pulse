/**
 * Catch-up briefing & market velocity — Pure core functions.
 *
 * The catch-up briefing is a daily ritual shown when the side panel reopens:
 * a compact recap of missions that arrived since the last active session
 * (count, Grade A gems, average TJM) plus the top opportunity, with a
 * one-click filter to that fresh wave.
 *
 * Zero I/O, zero async, strictly deterministic: `now`, `lastVisitAt` and the
 * missions list are injected by the shell. See
 * `src/lib/shell/storage/catch-up-visit.ts` for the persistence side.
 */

import type { Mission } from '../types/mission';
import { parseIsoDateTimeToEpochMs } from '../utils/iso-time';
import { getMissionScore } from '../scoring/mission-grade';

/** Minimum gap between sessions before a briefing is computed (30 min). */
export const MIN_BRIEFING_INTERVAL_MS = 30 * 60 * 1000;

/** A mission published within this window counts as "market velocity" (< 1 h). */
export const VELOCITY_WINDOW_MS = 60 * 60 * 1000;

/** Numeric score threshold for a mission to count as a Grade A "pépite". */
export const GRADE_A_SCORE_THRESHOLD = 80;

export interface CatchUpBriefing {
  /** Number of missions that arrived strictly after the last visit. */
  count: number;
  /** Number of Grade A "pépites" (score >= 80) among the fresh wave. */
  gradeA: number;
  /** Average advertised TJM of the fresh wave (null when none has a rate). */
  meanTjm: number | null;
  /** Highest-scored mission of the fresh wave (price of entry on ties). */
  topMission: Mission | null;
  /** IDs of the fresh wave — the 1-click filter target. */
  waveMissionIds: readonly string[];
}

function isDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Canonical "arrival" instant of a mission: the latest known timestamp
 * between its discovery (`scrapedAt`) and the platform publication
 * (`publishedAt`). Missions whose indexes stay resident across sessions
 * keep the discovery instant, while freshly published posts are also
 * surfaced even if a full scan has not re-run yet.
 */
export function arrivalEpochMs(mission: Mission): number | null {
  const candidates: number[] = [];
  if (mission.scrapedAt instanceof Date && !Number.isNaN(mission.scrapedAt.getTime())) {
    candidates.push(mission.scrapedAt.getTime());
  }
  if (mission.publishedAt) {
    const published = parseIsoDateTimeToEpochMs(mission.publishedAt);
    if (published !== null) {
      candidates.push(published);
    }
  }
  return candidates.length === 0 ? null : Math.max(...candidates);
}

/** A mission belongs to the fresh wave when it arrived strictly after the last visit. */
export function inBriefingWave(mission: Mission, lastVisitAt: Date): boolean {
  if (!isDate(lastVisitAt)) {
    return false;
  }
  const arrival = arrivalEpochMs(mission);
  return arrival !== null && arrival > lastVisitAt.getTime();
}

/**
 * Orders a mission for the top-opportunity pick: canonical score first,
 * then advertised TJM as price of entry, then stable insertion order.
 * Returns a comparable rank tuple — never NaN.
 */
function missionRank(mission: Mission): [number, number] {
  const score = getMissionScore(mission);
  const scoreValue = typeof score === 'number' ? score : -1;
  const tjm = typeof mission.tjm === 'number' && mission.tjm > 0 ? mission.tjm : -1;
  return [scoreValue, tjm];
}

/**
 * Selects the top opportunity of a wave: highest canonical score, then
 * highest TJM as price of entry, then first in feed order.
 */
export function selectTopOpportunity(wave: readonly Mission[]): Mission | null {
  let best: Mission | null = null;
  let bestRank: [number, number] | null = null;
  for (const mission of wave) {
    const rank = missionRank(mission);
    if (
      bestRank === null ||
      rank[0] > bestRank[0] ||
      (rank[0] === bestRank[0] && rank[1] > bestRank[1])
    ) {
      best = mission;
      bestRank = rank;
    }
  }
  return best;
}

/**
 * Computes the catch-up briefing for the panel(s) reloaded.
 *
 * Returns `null` (no banner) when there is no reliable `lastVisitAt`,
 * when the interval since the last visit is below the 30-minute threshold,
 * or when no mission arrived since then.
 */
export function computeCatchUpBriefing(
  missions: readonly Mission[],
  lastVisitAt: Date | null | undefined,
  now: Date
): CatchUpBriefing | null {
  if (!isDate(lastVisitAt) || !isDate(now)) {
    return null;
  }
  if (now.getTime() - lastVisitAt.getTime() < MIN_BRIEFING_INTERVAL_MS) {
    return null;
  }

  const wave = missions.filter((mission) => inBriefingWave(mission, lastVisitAt));
  if (wave.length === 0) {
    return null;
  }

  let gradeA = 0;
  const rates: number[] = [];
  for (const mission of wave) {
    const score = getMissionScore(mission);
    if (typeof score === 'number' && score >= GRADE_A_SCORE_THRESHOLD) {
      gradeA += 1;
    }
    if (typeof mission.tjm === 'number' && mission.tjm > 0) {
      rates.push(mission.tjm);
    }
  }

  return {
    count: wave.length,
    gradeA,
    meanTjm:
      rates.length === 0
        ? null
        : Math.round(rates.reduce((sum, rate) => sum + rate, 0) / rates.length),
    topMission: selectTopOpportunity(wave),
    waveMissionIds: wave.map((mission) => mission.id),
  };
}

/**
 * Formats a discrete market-velocity label for a mission published less than
 * an hour ago, or `null` otherwise (falls back to the absolute publication
 * date). Exact discreet copy: « Publiée il y a < 1h ».
 */
export function formatVelocityLabel(
  mission: Mission,
  now: Date,
  windowMs: number = VELOCITY_WINDOW_MS
): string | null {
  if (!isDate(now) || !mission.publishedAt) {
    return null;
  }
  const published = parseIsoDateTimeToEpochMs(mission.publishedAt);
  if (published === null) {
    return null;
  }
  const ageMs = now.getTime() - published;
  if (ageMs < 0 || ageMs >= windowMs) {
    return null;
  }
  return 'Publiée il y a < 1h';
}
