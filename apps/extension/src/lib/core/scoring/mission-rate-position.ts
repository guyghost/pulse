/**
 * Position de la fourchette TJM d'une mission sur une échelle fixe ancrée au
 * plancher du profil (DAO #175).
 *
 * Pure — zéro I/O, zéro side effect. Consomme les données déjà persistées
 * (mission.tjmMin/tjmMax/tjm, profile.tjmMin) : aucun recalcul de score, la
 * jauge de la MissionCard n'est qu'une lecture visuelle de ce que
 * `rawTjmScore` (relevance.ts) calcule déjà.
 *
 * Échelle fixe : 0 → `max(plancher × 2, borne haute mission)`. Le tick du
 * plancher occupe ainsi au plus la moitié de la piste — l'œil compare les
 * missions sans recalibrer.
 */

export interface MissionRatePositionInput {
  /** Borne basse annoncée par la plateforme. */
  tjmMin: number | null | undefined;
  /** Borne haute annoncée par la plateforme. */
  tjmMax: number | null | undefined;
  /** Valeur représentative de la mission (fallback quand pas de bornes). */
  tjm: number | null | undefined;
  /** Plancher du profil (null = profil sans plancher, DAO #174). */
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
