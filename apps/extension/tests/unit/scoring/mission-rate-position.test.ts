import { describe, expect, it } from 'vitest';

import { missionRatePosition } from '../../../src/lib/core/scoring/mission-rate-position';

describe('missionRatePosition', () => {
  it('masque la jauge quand le profil n’a pas de plancher (DAO #174, tjmMax null)', () => {
    expect(
      missionRatePosition({ tjmMin: 600, tjmMax: 900, tjm: 600, profileTjmMin: null })
    ).toEqual({ visible: false });
    expect(missionRatePosition({ tjmMin: 600, tjmMax: 900, tjm: 600, profileTjmMin: 0 })).toEqual({
      visible: false,
    });
    expect(missionRatePosition({ tjmMin: 600, tjmMax: 900, tjm: 600 })).toEqual({
      visible: false,
    });
  });

  it('masque la jauge quand la mission n’a aucun tarif', () => {
    expect(
      missionRatePosition({ tjmMin: null, tjmMax: null, tjm: null, profileTjmMin: 500 })
    ).toEqual({ visible: false });
    expect(
      missionRatePosition({
        tjmMin: undefined,
        tjmMax: undefined,
        tjm: undefined,
        profileTjmMin: 500,
      })
    ).toEqual({ visible: false });
  });

  it('positionne une fourchette au-dessus du plancher sur l’échelle plancher×2', () => {
    // Floor 500 → scale max(1000, 900) = 1000: tick at 0.5.
    const result = missionRatePosition({
      tjmMin: 600,
      tjmMax: 900,
      tjm: 600,
      profileTjmMin: 500,
    });
    expect(result).toEqual({
      visible: true,
      ratioMin: 0.6,
      ratioMax: 0.9,
      ratioFloor: 0.5,
      underFloor: false,
    });
  });

  it('détecte une fourchette sous le plancher (min < profileTjmMin)', () => {
    const result = missionRatePosition({
      tjmMin: 400,
      tjmMax: 600,
      tjm: 400,
      profileTjmMin: 500,
    });
    expect(result).toMatchObject({ visible: true, underFloor: true });
    expect(result.visible && result.ratioMin).toBe(0.4);
    expect(result.visible && result.ratioFloor).toBe(0.5);
  });

  it('valeur simple (tjm seul) : segment réduit au tick', () => {
    const result = missionRatePosition({
      tjmMin: null,
      tjmMax: null,
      tjm: 500,
      profileTjmMin: 500,
    });
    expect(result).toEqual({
      visible: true,
      ratioMin: 0.5,
      ratioMax: 0.5,
      ratioFloor: 0.5,
      underFloor: false,
    });
  });

  it('borne unique (tjmMax seul) : retombe sur la borne connue', () => {
    const result = missionRatePosition({
      tjmMin: null,
      tjmMax: 900,
      tjm: null,
      profileTjmMin: 500,
    });
    expect(result).toMatchObject({ visible: true, ratioMin: 0.9, ratioMax: 0.9 });
  });

  it('borne haute au-delà de plancher×2 : clamp à 1 sans dépasser la piste', () => {
    const result = missionRatePosition({
      tjmMin: 500,
      tjmMax: 2000,
      tjm: 500,
      profileTjmMin: 500,
    });
    // scaleMax = max(1000, 2000) = 2000 → floor at 0.25, segment 0.25 → 1.
    expect(result).toEqual({
      visible: true,
      ratioMin: 0.25,
      ratioMax: 1,
      ratioFloor: 0.25,
      underFloor: false,
    });
  });

  it('ignore les valeurs invalides (négatives, non finies)', () => {
    const result = missionRatePosition({
      tjmMin: -50,
      tjmMax: Number.NaN,
      tjm: 600,
      profileTjmMin: 500,
    });
    // tjmMin invalide → retombe sur tjm=600, tjmMax invalide → lo=hi=600.
    expect(result).toEqual({
      visible: true,
      ratioMin: 0.6,
      ratioMax: 0.6,
      ratioFloor: 0.5,
      underFloor: false,
    });
  });
});
