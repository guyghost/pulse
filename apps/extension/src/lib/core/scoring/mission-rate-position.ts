/**
 * Position of a mission's TJM range on a fixed scale anchored to the
 * profile floor (DAO #175).
 *
 * Pure — zero I/O, zero side effects. Consumes already-persisted data
 * (mission.tjmMin/tjmMax/tjm, profile.tjmMin): no score recomputation, the
 * MissionCard gauge is only a visual readout of what `rawTjmScore`
 * (relevance.ts) already computes.
 *
 * Fixed scale: 0 → `max(floor × 2, mission upper bound)`. The floor tick thus
 * takes at most half of the track — the eye compares missions without
 * recalibrating.
 */

export interface MissionRatePositionInput {
  /** Lower bound advertised by the platform. */
  tjmMin: number | null | undefined;
  /** Upper bound advertised by the platform. */
  tjmMax: number | null | undefined;
  /** Representative value for the mission (fallback when no bounds). */
  tjm: number | null | undefined;
  /** Profile floor (null = profile without floor, DAO #174). */
  profileTjmMin: number | null | undefined;
}

export type MissionRatePosition =
  | { visible: false }
  | {
      visible: true;
      /** Ratio 0..1 de la borne basse de la fourchette sur la piste. */
      ratioMin: number;
      /** Ratio 0..1 de la borne haute de la fourchette sur la piste. */
      ratioMax: number;
      /** Ratio 0..1 du tick du plancher utilisateur. */
      ratioFloor: number;
      /** La borne basse mission est sous le plancher du profil. */
      underFloor: boolean;
    };

const isValidRate = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function missionRatePosition(input: MissionRatePositionInput): MissionRatePosition {
  const floor =
    isValidRate(input.profileTjmMin) && input.profileTjmMin > 0 ? input.profileTjmMin : null;
  if (floor === null) {
    return { visible: false };
  }

  const lo = isValidRate(input.tjmMin)
    ? input.tjmMin
    : isValidRate(input.tjm)
      ? input.tjm
      : isValidRate(input.tjmMax)
        ? input.tjmMax
        : null;
  if (lo === null) {
    return { visible: false };
  }
  const hi = isValidRate(input.tjmMax) ? Math.max(input.tjmMax, lo) : lo;

  const scaleMax = Math.max(floor * 2, hi);

  return {
    visible: true,
    ratioMin: clamp01(lo / scaleMax),
    ratioMax: clamp01(hi / scaleMax),
    ratioFloor: clamp01(floor / scaleMax),
    underFloor: lo < floor,
  };
}
