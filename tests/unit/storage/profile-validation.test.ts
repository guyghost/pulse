import { describe, it, expect } from 'vitest';
import { UserProfileSchema } from '../../../src/lib/core/types/schemas';
import type { UserProfile } from '../../../src/lib/core/types/profile';

/**
 * Profil valide de base pour les tests.
 */
function validProfile(): UserProfile {
  return {
    firstName: 'Guy',
    stack: ['React', 'TypeScript'],
    tjmMin: 500,
    tjmMax: 700,
    location: 'Paris',
    remote: 'hybrid',
    seniority: 'senior',
    jobTitle: 'Développeur React Senior',
  };
}

describe('UserProfileSchema — validation Zod', () => {
  it('accepte un profil valide', () => {
    const result = UserProfileSchema.safeParse(validProfile());
    expect(result.success).toBe(true);
  });

  it('accepte un profil avec scoringWeights valides', () => {
    const profile = {
      ...validProfile(),
      scoringWeights: { stack: 40, location: 20, tjm: 25, remote: 15 },
    };
    const result = UserProfileSchema.safeParse(profile);
    expect(result.success).toBe(true);
  });

  it('rejette un firstName vide', () => {
    const profile = { ...validProfile(), firstName: '' };
    const result = UserProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(', ');
      expect(messages).toContain('prénom');
    }
  });

  it('rejette un firstName trop long (> 50 caractères)', () => {
    const profile = { ...validProfile(), firstName: 'A'.repeat(51) };
    const result = UserProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  it('rejette tjmMin négatif', () => {
    const profile = { ...validProfile(), tjmMin: -100 };
    const result = UserProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(', ');
      expect(messages).toContain('positif');
    }
  });

  it('rejette tjmMax négatif', () => {
    const profile = { ...validProfile(), tjmMax: -50 };
    const result = UserProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  it('rejette tjmMin > tjmMax', () => {
    const profile = { ...validProfile(), tjmMin: 800, tjmMax: 500 };
    const result = UserProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(', ');
      expect(messages).toContain('supérieur ou égal');
    }
  });

  it('rejette tjmMin > 5000', () => {
    const profile = { ...validProfile(), tjmMin: 6000, tjmMax: 7000 };
    const result = UserProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  it('rejette plus de 20 compétences dans stack', () => {
    const profile = {
      ...validProfile(),
      stack: Array.from({ length: 21 }, (_, i) => `Skill${i}`),
    };
    const result = UserProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(', ');
      expect(messages).toContain('20');
    }
  });

  it('rejette une compétence vide dans stack', () => {
    const profile = { ...validProfile(), stack: ['React', ''] };
    const result = UserProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  it('rejette des scoringWeights dont la somme est trop loin de 100', () => {
    const profile = {
      ...validProfile(),
      scoringWeights: { stack: 10, location: 10, tjm: 10, remote: 10 },
    };
    const result = UserProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(', ');
      expect(messages).toContain('somme des poids');
    }
  });

  it('rejette un scoringWeight négatif', () => {
    const profile = {
      ...validProfile(),
      scoringWeights: { stack: -10, location: 50, tjm: 40, remote: 20 },
    };
    const result = UserProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  it('rejette un scoringWeight > 100', () => {
    const profile = {
      ...validProfile(),
      scoringWeights: { stack: 110, location: 0, tjm: 0, remote: 0 },
    };
    const result = UserProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  it('accepte tjmMin === tjmMax', () => {
    const profile = { ...validProfile(), tjmMin: 600, tjmMax: 600 };
    const result = UserProfileSchema.safeParse(profile);
    expect(result.success).toBe(true);
  });

  it('accepte remote = "any"', () => {
    const profile = { ...validProfile(), remote: 'any' as const };
    const result = UserProfileSchema.safeParse(profile);
    expect(result.success).toBe(true);
  });

  it('rejette un remote invalide', () => {
    const profile = { ...validProfile(), remote: 'invalid' };
    const result = UserProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });
});
