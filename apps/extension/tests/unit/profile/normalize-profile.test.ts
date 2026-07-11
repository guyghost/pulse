import { describe, expect, it } from 'vitest';
import {
  appendUniqueNormalized,
  normalizeDailyRate,
  normalizeProfileDraft,
  normalizeTextInput,
  PROFILE_TJM_RANGE_ERROR,
  withProfileDefaults,
} from '../../../src/lib/core/profile/normalize-profile';

describe('normalize profile helpers', () => {
  it('normalizes text and daily rates', () => {
    expect(normalizeTextInput('  Lead   Svelte  ')).toBe('Lead Svelte');
    expect(normalizeDailyRate('650.4')).toBe(650);
    expect(normalizeDailyRate(-10)).toBe(0);
    expect(normalizeDailyRate('invalid')).toBe(0);
  });

  it('deduplicates normalized stack and pending input', () => {
    expect(appendUniqueNormalized([' Svelte ', 'TypeScript'], 'Svelte')).toEqual([
      'Svelte',
      'TypeScript',
    ]);
  });

  it('deduplicates case-insensitively while preserving the first-seen casing', () => {
    // Bug 6: adding "react" when "React" exists must not create a duplicate.
    expect(appendUniqueNormalized(['React'], 'react')).toEqual(['React']);
    expect(appendUniqueNormalized([' SaaS '], 'saas')).toEqual(['SaaS']);
    // Mixed existing duplicates are also collapsed case-insensitively.
    expect(appendUniqueNormalized(['React', 'react', 'Node'])).toEqual(['React', 'Node']);
  });

  it('fills missing profile fields with save-safe defaults', () => {
    expect(withProfileDefaults({ firstName: 'Guy' })).toEqual({
      firstName: 'Guy',
      keywords: [],
      tjmMin: 0,
      tjmMax: 0,
      location: '',
      remote: 'any',
      seniority: 'senior',
      jobTitle: '',
      scoringWeights: undefined,
      experiences: [],
      availability: null,
    });
  });

  it('builds a complete profile from onboarding/settings draft input', () => {
    const result = normalizeProfileDraft({
      firstName: ' Guy ',
      jobTitle: ' Architecte   Svelte ',
      location: ' Paris ',
      keywords: [' Svelte ', ' mission '],
      keywordInput: 'TypeScript',
      tjmMin: 600,
      tjmMax: 750,
      remote: 'hybrid',
      seniority: 'senior',
    });

    expect(result.ok).toBe(true);
    expect(result.profile).toMatchObject({
      firstName: 'Guy',
      jobTitle: 'Architecte Svelte',
      location: 'Paris',
      keywords: ['Svelte', 'mission', 'TypeScript'],
      tjmMin: 600,
      tjmMax: 750,
      remote: 'hybrid',
      seniority: 'senior',
    });
  });

  it('rejects a TJM minimum above the maximum', () => {
    const result = normalizeProfileDraft({ tjmMin: 900, tjmMax: 700 });

    expect(result).toEqual({ ok: false, error: PROFILE_TJM_RANGE_ERROR });
  });

  it('preserves experiences passed through the draft input', () => {
    const experiences = [
      {
        id: 'exp-1',
        title: 'Lead',
        company: 'Acme',
        location: 'Paris',
        startDate: '2023-01',
        endDate: null,
        isCurrent: true,
        description: 'Desc.',
        skills: ['Svelte'],
        source: 'manual' as const,
        sourceExternalId: null,
        positionIndex: 0,
        updatedAt: 1_700_000_000_000,
      },
    ];
    const result = normalizeProfileDraft({
      firstName: 'Guy',
      experiences,
    });

    expect(result.ok).toBe(true);
    expect(result.profile?.experiences).toEqual(experiences);
  });

  it('defaults experiences to an empty array when not provided', () => {
    const result = normalizeProfileDraft({ firstName: 'Guy' });

    expect(result.ok).toBe(true);
    expect(result.profile?.experiences).toEqual([]);
  });
});
