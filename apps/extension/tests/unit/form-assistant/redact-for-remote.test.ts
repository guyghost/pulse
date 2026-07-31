import { describe, it, expect } from 'vitest';
import { redactForRemote } from '../../../src/lib/core/form-assistant/redact-for-remote';
import type { FieldDescriptor } from '../../../src/lib/core/form-assistant/types';
import type { UserProfile } from '../../../src/lib/core/types/profile';

function makeProfile(over: Partial<UserProfile> = {}): UserProfile {
  return {
    firstName: 'Ada',
    keywords: ['TypeScript', 'React'],
    tjmMin: 500,
    tjmMax: 700,
    location: 'Paris',
    remote: 'hybrid',
    seniority: 'senior',
    jobTitle: 'Tech Lead',
    experiences: [],
    availability: null,
    ...over,
  };
}

const field: FieldDescriptor = {
  kind: 'cover-letter',
  label: 'Lettre de motivation',
  placeholder: '',
  inputType: 'textarea',
  required: true,
};

describe('redactForRemote — allowlist', () => {
  it('projette les champs professionnels allowlistés', () => {
    const out = redactForRemote(field, makeProfile());
    expect(out.profile).toMatchObject({
      firstName: 'Ada',
      jobTitle: 'Tech Lead',
      seniority: 'senior',
      location: 'Paris',
      remote: 'hybrid',
      tjmMin: '500',
      tjmMax: '700',
      keywords: ['TypeScript', 'React'],
    });
  });

  it('ne fait JAMAIS transiter d’email/téléphone (absents du type)', () => {
    const out = redactForRemote(field, makeProfile());
    expect(out.profile).not.toHaveProperty('email');
    expect(out.profile).not.toHaveProperty('phone');
    // experiences.description est exclu : pas de clé experiences.
    expect(out.profile).not.toHaveProperty('experiences');
  });

  it('omet les champs vides', () => {
    const out = redactForRemote(field, makeProfile({ firstName: '', location: '', keywords: [] }));
    expect(out.profile).not.toHaveProperty('firstName');
    expect(out.profile).not.toHaveProperty('location');
    expect(out.profile).not.toHaveProperty('keywords');
  });

  it('plafonne le nombre de keywords', () => {
    const many = Array.from({ length: 50 }, (_, i) => `skill-${i}`);
    const out = redactForRemote(field, makeProfile({ keywords: many }));
    expect((out.profile.keywords as string[]).length).toBe(16);
  });

  it('reporte les métadonnées du champ', () => {
    const out = redactForRemote(field, makeProfile());
    expect(out.kind).toBe('cover-letter');
    expect(out.label).toBe('Lettre de motivation');
    expect(out.required).toBe(true);
    expect(out.inputType).toBe('textarea');
  });
});
