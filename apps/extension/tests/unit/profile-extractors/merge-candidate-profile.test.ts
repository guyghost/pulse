import { describe, expect, it } from 'vitest';
import type { UserProfile } from '../../../src/lib/core/types/profile';
import type {
  CandidateExperienceDraft,
  CanonicalCandidateProfileDraft,
} from '../../../src/lib/core/profile-extractors/types';
import { mergeCandidateProfileIntoUserProfile } from '../../../src/lib/core/profile-extractors/merge-candidate-profile';

const NOW = 1_700_000_000_000;

function makeDraft(
  overrides: Partial<CanonicalCandidateProfileDraft> = {}
): CanonicalCandidateProfileDraft {
  return {
    title: 'Lead Frontend Svelte',
    summary: '',
    experiences: [],
    skills: [],
    education: [],
    links: [],
    source: 'linkedin',
    confidence: 0.9,
    capturedAt: '2026-06-27T00:00:00.000Z',
    profileUrl: 'https://www.linkedin.com/in/test',
    ...overrides,
  };
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    firstName: 'Guy',
    keywords: ['Svelte', 'TypeScript', 'mission svelte'],
    tjmMin: 650,
    tjmMax: 900,
    location: 'Paris',
    remote: 'hybrid',
    seniority: 'senior',
    jobTitle: 'Lead Frontend',
    ...overrides,
  };
}

function experience(overrides: Partial<CandidateExperienceDraft> = {}): CandidateExperienceDraft {
  return {
    title: 'Lead',
    company: null,
    employmentType: null,
    location: null,
    startDate: null,
    endDate: null,
    isCurrent: true,
    description: '',
    skills: [],
    source: 'linkedin',
    sourceExternalId: null,
    positionIndex: 0,
    ...overrides,
  };
}

describe('mergeCandidateProfileIntoUserProfile', () => {
  it('overwrites jobTitle with the draft title', () => {
    const merged = mergeCandidateProfileIntoUserProfile(
      makeProfile({ jobTitle: 'Ancien titre' }),
      makeDraft({ title: 'Nouveau titre LinkedIn' }),
      NOW
    );

    expect(merged.jobTitle).toBe('Nouveau titre LinkedIn');
  });

  it('unions the current keywords with draft skills, deduping case-insensitively while keeping first casing', () => {
    const merged = mergeCandidateProfileIntoUserProfile(
      makeProfile({ keywords: ['Svelte', 'TypeScript'] }),
      makeDraft({
        skills: [
          { skill: 'svelte', source: 'linkedin', confidence: 0.9 },
          { skill: 'React', source: 'linkedin', confidence: 0.8 },
          { skill: 'TYPESCRIPT', source: 'linkedin', confidence: 0.7 },
        ],
      }),
      NOW
    );

    expect(merged.keywords).toEqual(['Svelte', 'TypeScript', 'React']);
  });

  it('keeps the current location when it is non-empty', () => {
    const merged = mergeCandidateProfileIntoUserProfile(
      makeProfile({ location: 'Lyon' }),
      makeDraft({
        experiences: [experience({ location: 'Marseille' })],
      }),
      NOW
    );

    expect(merged.location).toBe('Lyon');
  });

  it('fills location from the first experience that carries a location when current is empty', () => {
    const merged = mergeCandidateProfileIntoUserProfile(
      makeProfile({ location: '' }),
      makeDraft({
        experiences: [
          experience({ location: null, positionIndex: 0 }),
          experience({ title: 'Dev', location: 'Bordeaux', positionIndex: 1 }),
          experience({ title: 'Junior', location: 'Nantes', positionIndex: 2 }),
        ],
      }),
      NOW
    );

    expect(merged.location).toBe('Bordeaux');
  });

  it('leaves location empty when current is empty and no experience has a location', () => {
    const merged = mergeCandidateProfileIntoUserProfile(
      makeProfile({ location: '   ' }),
      makeDraft({
        experiences: [experience({ location: null }), experience({ location: '  ' })],
      }),
      NOW
    );

    expect(merged.location).toBe('');
  });

  it('returns a complete UserProfile with defaults when current is null', () => {
    const merged = mergeCandidateProfileIntoUserProfile(
      null,
      makeDraft({ title: 'Solo Title' }),
      NOW
    );

    expect(merged).toEqual({
      firstName: '',
      keywords: [],
      tjmMin: 0,
      tjmMax: 0,
      location: '',
      remote: 'any',
      seniority: 'senior',
      jobTitle: 'Solo Title',
      scoringWeights: undefined,
      experiences: [],
      availability: null,
    });
  });

  it('preserves tjm, remote, seniority and keywords from the current profile', () => {
    const merged = mergeCandidateProfileIntoUserProfile(
      makeProfile({
        tjmMin: 700,
        tjmMax: 950,
        remote: 'full',
        seniority: 'confirmed',
        keywords: ['react', 'remote'],
      }),
      makeDraft({ title: 'Nouveau titre' }),
      NOW
    );

    expect(merged.tjmMin).toBe(700);
    expect(merged.tjmMax).toBe(950);
    expect(merged.remote).toBe('full');
    expect(merged.seniority).toBe('confirmed');
    expect(merged.keywords).toEqual(['react', 'remote']);
    expect(merged.firstName).toBe('Guy');
  });

  it('preserves custom scoringWeights from the current profile', () => {
    const weights = { stack: 50, location: 10, tjm: 30, remote: 10 };
    const merged = mergeCandidateProfileIntoUserProfile(
      makeProfile({ scoringWeights: weights }),
      makeDraft(),
      NOW
    );

    expect(merged.scoringWeights).toEqual(weights);
  });

  it('does not mutate the input current profile', () => {
    const current = makeProfile({ keywords: ['Svelte'] });
    const merged = mergeCandidateProfileIntoUserProfile(
      current,
      makeDraft({ skills: [{ skill: 'React', source: 'linkedin', confidence: 0.9 }] }),
      NOW
    );

    expect(current.keywords).toEqual(['Svelte']);
    expect(merged.keywords).not.toBe(current.keywords);
    expect(merged.keywords).toEqual(['Svelte', 'React']);
  });
});
