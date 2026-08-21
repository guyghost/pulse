import { describe, expect, it } from 'vitest';
import type { OnboardingPreviewInput } from '$lib/core/scoring/onboarding-preview';
import { previewOnboardingMatch, REFERENCE_MISSION } from '$lib/core/scoring/onboarding-preview';
import { scoreToGrade } from '$lib/core/types/score';
import { scoreMission } from '$lib/core/scoring/relevance';

const neutralInput: OnboardingPreviewInput = {
  tjmMin: 0,
  tjmMax: 0,
  remote: 'any',
  keywords: [],
  location: '',
};

describe('previewOnboardingMatch', () => {
  it('returns a letter grade A–F, never a raw percentage label', () => {
    const result = previewOnboardingMatch(neutralInput);

    expect(['A', 'B', 'C', 'D', 'F']).toContain(result.grade);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('scores the empty draft against the neutral default profile', () => {
    const result = previewOnboardingMatch(neutralInput);

    const neutralProfile = {
      firstName: '',
      keywords: [],
      tjmMin: 0,
      tjmMax: 0,
      location: '',
      remote: 'any' as const,
      seniority: 'confirmed' as const,
      jobTitle: '',
      experiences: [],
      availability: null,
    };
    const expected = scoreMission(REFERENCE_MISSION, neutralProfile);

    expect(result.score).toBe(expected.total);
    expect(result.grade).toBe(scoreToGrade(expected.total));
  });

  it('reaches a strong match when the draft mirrors the reference mission criteria', () => {
    const matched = previewOnboardingMatch({
      tjmMin: 450,
      tjmMax: 600,
      remote: 'hybrid',
      keywords: ['React', 'TypeScript', 'Node.js'],
      location: 'Paris',
    });

    expect(matched.score).toBe(100);
    expect(matched.grade).toBe('A');
    expect(matched.label).toBe('Forte correspondance');
  });

  it('degrades when the TJM range excludes the reference mission', () => {
    const result = previewOnboardingMatch({
      ...neutralInput,
      tjmMin: 800,
      tjmMax: 900,
    });

    expect(result.grade).not.toBe('A');
  });

  it('maps grades to the three dynamic labels', () => {
    const strong = previewOnboardingMatch({
      tjmMin: 450,
      tjmMax: 600,
      remote: 'hybrid',
      keywords: ['React'],
      location: 'Paris',
    });

    expect(['Forte correspondance', 'Correspondance partielle', 'Hors critères']).toContain(
      strong.label
    );
  });

  it('uses a deterministic reference mission', () => {
    expect(REFERENCE_MISSION.id).toBe('reference-mission');
    expect(REFERENCE_MISSION.tjm).toBe(520);
    expect(previewOnboardingMatch(neutralInput)).toEqual(previewOnboardingMatch(neutralInput));
  });
});
