import { describe, it, expect } from 'vitest';
import { buildFieldPrompt } from '../../../src/lib/core/form-assistant/build-field-prompt';
import type { FieldDescriptor } from '../../../src/lib/core/form-assistant/types';
import type { UserProfile } from '../../../src/lib/core/types/profile';

function field(kind: FieldDescriptor['kind'], label = 'Champ'): FieldDescriptor {
  return {
    kind,
    label,
    placeholder: '',
    inputType: 'text',
    required: false,
  };
}

function baseProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    firstName: 'Ada',
    keywords: ['TypeScript', 'Svelte'],
    tjmMin: 500,
    tjmMax: 700,
    location: 'Paris',
    remote: 'remote',
    seniority: 'senior',
    jobTitle: 'Tech Lead',
    experiences: [],
    availability: null,
    ...overrides,
  };
}

describe('buildFieldPrompt', () => {
  it('injecte le cœur du profil (prénom, titre, TJM, compétences)', () => {
    const prompt = buildFieldPrompt(field('first-name'), baseProfile());
    expect(prompt).toContain('Prénom : Ada');
    expect(prompt).toContain('Titre : Tech Lead');
    expect(prompt).toContain('TJM min : 500€');
    expect(prompt).toContain('Compétences : TypeScript, Svelte');
  });

  it('omet la ligne de disponibilité quand availability est null', () => {
    const prompt = buildFieldPrompt(field('availability'), baseProfile());
    expect(prompt).not.toContain('Disponibilité :');
  });

  it('injecte la disponibilité (statut + date + note) quand elle est renseignée', () => {
    const prompt = buildFieldPrompt(
      field('availability'),
      baseProfile({
        availability: {
          status: 'from-date',
          date: '2025-02-01',
          note: 'Mission actuelle en cours',
          updatedAt: 1_700_000_000_000,
        },
      })
    );
    expect(prompt).toContain('Disponibilité : Statut : Disponible à partir du');
    expect(prompt).toContain('À partir du : 2025-02-01');
    expect(prompt).toContain('Note : Mission actuelle en cours');
  });

  it('omet la date et la note quand elles sont absentes (statut immediate)', () => {
    const prompt = buildFieldPrompt(
      field('availability'),
      baseProfile({
        availability: {
          status: 'immediate',
          date: null,
          note: '',
          updatedAt: 1_700_000_000_000,
        },
      })
    );
    expect(prompt).toContain('Disponibilité : Statut : Disponible immédiatement');
    expect(prompt).not.toContain('À partir du');
    expect(prompt).not.toContain('Note :');
  });

  it('restreint à 16 mots-clés maximum', () => {
    const many = Array.from({ length: 30 }, (_, i) => `skill-${i}`);
    const prompt = buildFieldPrompt(field('skill'), baseProfile({ keywords: many }));
    expect(prompt).toContain('skill-0');
    expect(prompt).toContain('skill-15');
    expect(prompt).not.toContain('skill-16');
  });

  it('est déterministe : mêmes entrées ⇒ même prompt', () => {
    const f = field('cover-letter');
    const p = baseProfile();
    expect(buildFieldPrompt(f, p)).toBe(buildFieldPrompt(f, p));
  });
});
