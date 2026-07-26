import { describe, expect, it } from 'vitest';

import { buildConsentedCopilotPayload } from '../../../src/lib/core/copilot/build-consented-payload';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { UserProfile } from '../../../src/lib/core/types/profile';

const mission: Mission = {
  id: 'mission-1',
  title: 'Lead Svelte',
  client: 'Acme',
  description: 'Construire une application Svelte sécurisée.',
  stack: ['Svelte', 'TypeScript'],
  tjm: 750,
  location: 'Paris',
  remote: 'hybrid',
  duration: '6 mois',
  startDate: '2026-09-01',
  publishedAt: null,
  url: 'https://platform.example/private/mission-1',
  source: 'free-work',
  scrapedAt: new Date('2026-07-21T10:00:00.000Z'),
  seniority: 'senior',
  scoreBreakdown: null,
  score: 90,
  semanticScore: null,
  semanticReason: null,
};

const profile: UserProfile = {
  firstName: 'Ada',
  keywords: ['Svelte', 'TypeScript'],
  tjmMin: 650,
  tjmMax: 850,
  location: 'Paris',
  remote: 'any',
  seniority: 'senior',
  jobTitle: 'Lead frontend',
  availability: null,
  experiences: [
    {
      id: 'experience-1',
      title: 'Lead frontend',
      company: 'Example Corp',
      employmentType: 'Freelance',
      location: 'Paris',
      startDate: '2024-01',
      endDate: null,
      isCurrent: true,
      description: 'Migration progressive vers Svelte.',
      skills: ['Svelte', 'TypeScript'],
      source: 'manual',
      sourceExternalId: 'private-linkedin-id',
      positionIndex: 0,
      updatedAt: 1,
    },
    {
      id: 'experience-not-consented',
      title: 'Développeuse',
      company: 'Secret Corp',
      employmentType: 'CDI',
      location: 'Lyon',
      startDate: '2020-01',
      endDate: '2023-12',
      isCurrent: false,
      description: 'Contenu du CV non consenti.',
      skills: ['React'],
      source: 'linkedin',
      sourceExternalId: 'linkedin-secret',
      positionIndex: 1,
      updatedAt: 1,
    },
  ],
};

describe('buildConsentedCopilotPayload', () => {
  it('projects only shared allowlist fields and explicitly selected evidence', () => {
    const result = buildConsentedCopilotPayload(mission, profile, {
      missionFields: ['title', 'description', 'displayedTjm'],
      profileFields: ['jobTitle', 'tjmBounds'],
      evidenceIds: ['experience-1'],
    });

    expect(result).toEqual({
      ok: true,
      payload: {
        mission: {
          title: 'Lead Svelte',
          description: 'Construire une application Svelte sécurisée.',
          displayedTjm: { min: 750, max: 750, currency: 'EUR' },
        },
        profile: {
          jobTitle: 'Lead frontend',
          tjmBounds: { min: 650, target: 750, max: 850, currency: 'EUR' },
        },
        experienceEvidence: [
          {
            evidenceId: 'experience-1',
            role: 'Lead frontend',
            company: 'Example Corp',
            summary: 'Migration progressive vers Svelte.',
            skills: ['Svelte', 'TypeScript'],
          },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain('private/mission');
    expect(JSON.stringify(result)).not.toContain('experience-not-consented');
    expect(JSON.stringify(result)).not.toContain('private-linkedin-id');
    expect(JSON.stringify(result)).not.toContain('Contenu du CV non consenti');
  });

  it('fails closed for missing or unusable evidence', () => {
    expect(
      buildConsentedCopilotPayload(mission, profile, {
        missionFields: ['title'],
        profileFields: [],
        evidenceIds: ['missing'],
      })
    ).toEqual({ ok: false, code: 'EVIDENCE_NOT_FOUND' });

    expect(
      buildConsentedCopilotPayload(
        mission,
        {
          ...profile,
          experiences: [{ ...profile.experiences[0], description: '' }],
        },
        { missionFields: ['title'], profileFields: [], evidenceIds: ['experience-1'] }
      )
    ).toEqual({ ok: false, code: 'EVIDENCE_INVALID' });
  });

  it('rejects empty consent and oversized canonical content', () => {
    expect(
      buildConsentedCopilotPayload(mission, profile, {
        missionFields: [],
        profileFields: [],
        evidenceIds: [],
      })
    ).toEqual({ ok: false, code: 'INVALID_CONSENT' });

    expect(
      buildConsentedCopilotPayload({ ...mission, description: 'x'.repeat(20_001) }, profile, {
        missionFields: ['description'],
        profileFields: [],
        evidenceIds: [],
      })
    ).toEqual({ ok: false, code: 'PAYLOAD_REJECTED' });
  });
});
