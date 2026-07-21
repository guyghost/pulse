import { describe, expect, it } from 'vitest';

import { buildTjmCoachFacts } from '../../../src/lib/core/copilot/build-tjm-coach-facts';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { UserProfile } from '../../../src/lib/core/types/profile';

const mission = {
  id: 'mission-1',
  title: 'Mission Svelte',
  client: null,
  description: 'Description',
  stack: ['Svelte'],
  tjm: 720,
  location: null,
  remote: 'full',
  duration: null,
  startDate: null,
  publishedAt: null,
  url: 'https://example.com',
  source: 'free-work',
  scrapedAt: new Date('2026-07-21T00:00:00.000Z'),
  seniority: null,
  scoreBreakdown: null,
  score: null,
  semanticScore: null,
  semanticReason: null,
} satisfies Mission;

const profile = {
  firstName: 'Ada',
  keywords: ['TypeScript'],
  tjmMin: 650,
  tjmMax: 850,
  location: 'Paris',
  remote: 'any',
  seniority: 'senior',
  jobTitle: 'Lead frontend',
  experiences: [],
  availability: null,
} satisfies UserProfile;

const consent = {
  missionFields: ['stack', 'displayedTjm'] as const,
  profileFields: ['keywords', 'tjmBounds'] as const,
  evidenceIds: [],
};

describe('buildTjmCoachFacts', () => {
  it('derives weighted local market evidence without producing a recommendation', () => {
    const result = buildTjmCoachFacts(
      mission,
      profile,
      {
        records: [
          {
            stack: 'svelte',
            date: '2026-07-01',
            min: 600,
            max: 800,
            average: 700,
            sampleCount: 4,
            seniority: 'senior',
            region: 'ile-de-france',
          },
          {
            stack: 'typescript',
            date: '2026-07-15',
            min: 650,
            max: 900,
            average: 800,
            sampleCount: 6,
            seniority: null,
            region: null,
          },
          {
            stack: 'rust',
            date: '2026-07-20',
            min: 900,
            max: 1_100,
            average: 1_000,
            sampleCount: 100,
            seniority: null,
            region: null,
          },
        ],
      },
      consent
    );

    expect(result).toEqual({
      ok: true,
      facts: {
        schemaVersion: 1,
        confidence: 'medium',
        missionDisplayedTjm: 720,
        profileBounds: { min: 650, target: 750, max: 850, currency: 'EUR' },
        market: {
          matchedStacks: ['svelte', 'typescript'],
          recordCount: 2,
          sampleCount: 10,
          min: 600,
          weightedAverage: 760,
          max: 900,
          // One dated mission-stack point cannot establish a trend. The
          // separate profile-keyword series must not leak into that signal.
          trend: 'stable',
          lastObservedAt: '2026-07-15',
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain('recommendation');
  });

  it('returns explicit insufficient evidence while preserving deterministic bounds', () => {
    expect(buildTjmCoachFacts(mission, profile, { records: [] }, consent)).toMatchObject({
      ok: true,
      facts: {
        confidence: 'insufficient',
        market: { recordCount: 0, sampleCount: 0, weightedAverage: null },
      },
    });
  });

  it('requires consent to every field used to derive the facts', () => {
    expect(
      buildTjmCoachFacts(
        mission,
        profile,
        { records: [] },
        {
          missionFields: ['displayedTjm'],
          profileFields: ['tjmBounds'],
          evidenceIds: [],
        }
      )
    ).toEqual({ ok: false, code: 'TJM_FACTS_CONSENT_REQUIRED' });
  });

  it('ignores non-positive or non-ISO history records', () => {
    const result = buildTjmCoachFacts(
      mission,
      profile,
      {
        records: [
          {
            stack: 'svelte',
            date: 'not-a-date',
            min: 600,
            max: 800,
            average: 700,
            sampleCount: 10,
            seniority: null,
            region: null,
          },
          {
            stack: 'svelte',
            date: '2026-07-01',
            min: -100,
            max: 800,
            average: 700,
            sampleCount: 10,
            seniority: null,
            region: null,
          },
        ],
      },
      consent
    );

    expect(result).toMatchObject({
      ok: true,
      facts: {
        confidence: 'insufficient',
        market: { recordCount: 0, sampleCount: 0, weightedAverage: null },
      },
    });
  });

  it('rejects placeholder and out-of-market profile bounds', () => {
    expect(
      buildTjmCoachFacts(
        mission,
        { ...profile, tjmMin: 0, tjmMax: 9_999 },
        { records: [] },
        consent
      )
    ).toEqual({ ok: false, code: 'TJM_FACTS_INVALID' });
    expect(
      buildTjmCoachFacts(
        mission,
        { ...profile, tjmMin: 800, tjmMax: 700 },
        { records: [] },
        consent
      )
    ).toEqual({ ok: false, code: 'TJM_FACTS_INVALID' });
  });
});
