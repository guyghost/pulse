import { describe, expect, it } from 'vitest';
import {
  createDefaultProfile,
  isDefaultProfile,
  mergeDraftOntoDefault,
} from '../../../src/lib/core/profile/defaults';

describe('mergeDraftOntoDefault (P0-A1)', () => {
  it('un draft vide laisse le profil de base intact', () => {
    const base = createDefaultProfile();
    const merged = mergeDraftOntoDefault({}, base);
    expect(merged).toEqual(base);
    expect(isDefaultProfile(merged)).toBe(true);
  });

  it('un draft avec signal complete le profil défaut', () => {
    const base = createDefaultProfile();
    const merged = mergeDraftOntoDefault(
      {
        firstName: '  Guy  ',
        jobTitle: 'Dev Python',
        keywords: ['python', 'aws'],
        tjmMin: 600,
        tjmMax: 800,
        location: 'Nantes',
        remote: 'full',
      },
      base
    );
    expect(merged.firstName).toBe('Guy');
    expect(merged.jobTitle).toBe('Dev Python');
    expect(merged.keywords).toEqual(['python', 'aws']);
    expect(merged.tjmMin).toBe(600);
    expect(merged.tjmMax).toBe(800);
    expect(merged.location).toBe('Nantes');
    expect(merged.remote).toBe('full');
    // Le reste du profil défaut est préservé (poids de scoring notamment).
    expect(merged.scoringWeights).toEqual(base.scoringWeights);
    expect(merged.seniority).toBe(base.seniority);
  });

  it('un draft vide ne dégrade jamais un profil existant non défaut', () => {
    const base = {
      ...createDefaultProfile(),
      firstName: 'Guy',
      keywords: ['react'],
      tjmMin: 650,
      remote: 'hybrid' as const,
    };
    const merged = mergeDraftOntoDefault(
      { firstName: '', keywords: [], tjmMin: 0, remote: 'any' },
      base
    );
    expect(merged.firstName).toBe('Guy');
    expect(merged.keywords).toEqual(['react']);
    expect(merged.tjmMin).toBe(650);
    expect(merged.remote).toBe('hybrid');
  });

  it('le draft gagne sur le base quand il apporte une valeur', () => {
    const base = { ...createDefaultProfile(), firstName: 'Ancien', tjmMin: 500 };
    const merged = mergeDraftOntoDefault({ firstName: 'Nouveau', tjmMin: 700 }, base);
    expect(merged.firstName).toBe('Nouveau');
    expect(merged.tjmMin).toBe(700);
  });

  it('tjmMax : le base gagne quand le draft ne définit pas (null = non défini)', () => {
    const base = { ...createDefaultProfile(), tjmMax: 900 };
    // draft.tjmMax null = « non défini » → base conservé.
    const merged = mergeDraftOntoDefault({ tjmMax: null }, base);
    expect(merged.tjmMax).toBe(900);
    // draft.tjmMax explicite → draft gagne.
    const narrowed = mergeDraftOntoDefault({ tjmMax: 800 }, base);
    expect(narrowed.tjmMax).toBe(800);
  });

  it('purge les espaces et ignore les chaînes blanches du draft', () => {
    const base = { ...createDefaultProfile(), firstName: 'Base' };
    const merged = mergeDraftOntoDefault({ firstName: '   ' }, base);
    expect(merged.firstName).toBe('Base');
  });
});
