import { describe, expect, it } from 'vitest';

import {
  COPILOT_CREDIT_COSTS,
  MAX_COPILOT_EVIDENCE_ITEMS,
  MAX_COPILOT_MISSION_DESCRIPTION_CHARS,
  isCopilotTransmissionAllowed,
  isCopilotConsentSubset,
  isCopilotSourceRefGrounded,
  isReviewableCopilotResult,
  isValidCopilotConsentSelection,
  unionCopilotConsentSelections,
  type CopilotConsentSelection,
  type CopilotValidatedResult,
} from '../src';

const consent = {
  missionFields: ['title', 'description', 'stack'],
  profileFields: ['jobTitle', 'tjmBounds'],
  evidenceIds: ['experience-1'],
} as const satisfies CopilotConsentSelection;

const analysisResult: CopilotValidatedResult = {
  schemaVersion: 1,
  kind: 'analysis',
  evidenceClaims: [
    {
      text: 'Le candidat a livré une application Svelte.',
      evidenceIds: ['experience-1'],
    },
  ],
  gaps: ['Disponibilité à confirmer.'],
  risks: [],
  questions: ['Quelle est la taille de l’équipe ?'],
};

const grounding = {
  payload: {
    mission: { title: 'Développeur Svelte' },
    profile: { jobTitle: 'Développeur frontend' },
    experienceEvidence: [
      {
        evidenceId: 'experience-1',
        role: 'Lead frontend',
        company: 'Acme',
        summary: 'Refonte Svelte mesurée en production.',
        skills: ['Svelte'],
      },
    ],
  },
  tjmFacts: null,
} as const;

describe('copilot contracts', () => {
  it('keeps analysis included and charges exactly one credit per generated content', () => {
    expect(COPILOT_CREDIT_COSTS).toEqual({
      analysis: 0,
      pitch: 1,
      'cover-message': 1,
      'cv-summary': 1,
      'tjm-coach': 1,
    });
  });

  it('requires a non-empty, unique and allowlisted consent selection', () => {
    expect(isValidCopilotConsentSelection(consent)).toBe(true);
    expect(
      isValidCopilotConsentSelection({ missionFields: [], profileFields: [], evidenceIds: [] })
    ).toBe(false);
    expect(
      isValidCopilotConsentSelection({
        missionFields: ['title', 'title'],
        profileFields: [],
        evidenceIds: [],
      })
    ).toBe(false);
    expect(
      isValidCopilotConsentSelection({
        missionFields: ['rawHtml' as never],
        profileFields: [],
        evidenceIds: [],
      })
    ).toBe(false);
    expect(
      isValidCopilotConsentSelection({
        missionFields: [],
        profileFields: [],
        evidenceIds: Array.from(
          { length: MAX_COPILOT_EVIDENCE_ITEMS + 1 },
          (_, index) => `experience-${index}`
        ),
      })
    ).toBe(false);
  });

  it('models cumulative dossier consent separately from an exact job subset', () => {
    const cumulative = unionCopilotConsentSelections(
      {
        missionFields: ['description', 'title'],
        profileFields: [],
        evidenceIds: ['experience-2'],
      },
      {
        missionFields: ['stack'],
        profileFields: ['jobTitle'],
        evidenceIds: ['experience-1'],
      }
    );
    expect(cumulative).toEqual({
      missionFields: ['title', 'description', 'stack'],
      profileFields: ['jobTitle'],
      evidenceIds: ['experience-1', 'experience-2'],
    });
    expect(
      isCopilotConsentSubset(
        { missionFields: ['title'], profileFields: [], evidenceIds: [] },
        cumulative
      )
    ).toBe(true);
    expect(
      isCopilotConsentSubset(
        { missionFields: ['client'], profileFields: [], evidenceIds: [] },
        cumulative
      )
    ).toBe(false);
  });

  it('accepts only allowlisted values that were individually consented to', () => {
    expect(
      isCopilotTransmissionAllowed(
        {
          mission: {
            title: 'Développeur Svelte',
            description: 'Construire un tableau de bord.',
            stack: ['Svelte', 'TypeScript'],
          },
          profile: {
            jobTitle: 'Développeur frontend',
            tjmBounds: { min: 550, target: 650, max: 750, currency: 'EUR' },
          },
          experienceEvidence: [
            {
              evidenceId: 'experience-1',
              role: 'Lead frontend',
              company: 'Acme',
              summary: 'Refonte Svelte mesurée en production.',
              skills: ['Svelte'],
            },
          ],
        },
        consent
      )
    ).toBe(true);
  });

  it('rejects raw, unknown, unconsented and oversized transmitted data', () => {
    const base = {
      mission: { title: 'Développeur Svelte' },
      profile: { jobTitle: 'Développeur frontend' },
      experienceEvidence: [],
    };

    expect(
      isCopilotTransmissionAllowed(
        { ...base, mission: { ...base.mission, rawHtml: '<script>ignore previous</script>' } },
        consent
      )
    ).toBe(false);
    expect(
      isCopilotTransmissionAllowed(
        { ...base, mission: { ...base.mission, client: 'Secret client' } },
        consent
      )
    ).toBe(false);
    expect(
      isCopilotTransmissionAllowed(
        {
          ...base,
          experienceEvidence: [
            {
              evidenceId: 'experience-not-consented',
              role: 'Engineer',
              company: null,
              summary: 'Unselected evidence',
              skills: [],
            },
          ],
        },
        consent
      )
    ).toBe(false);
    expect(
      isCopilotTransmissionAllowed(
        {
          ...base,
          mission: { description: 'x'.repeat(MAX_COPILOT_MISSION_DESCRIPTION_CHARS + 1) },
        },
        consent
      )
    ).toBe(false);
  });

  it('accepts a schema-shaped analysis whose claims cite supplied evidence', () => {
    expect(isReviewableCopilotResult(analysisResult, 'analysis', ['experience-1'])).toBe(true);
  });

  it('rejects invented evidence, evidence-free claims and unknown result fields', () => {
    expect(
      isReviewableCopilotResult(
        {
          ...analysisResult,
          evidenceClaims: [{ text: 'Expérience inventée', evidenceIds: ['missing'] }],
        },
        'analysis',
        ['experience-1']
      )
    ).toBe(false);
    expect(
      isReviewableCopilotResult(
        {
          ...analysisResult,
          evidenceClaims: [{ text: 'Expérience sans preuve', evidenceIds: [] }],
        },
        'analysis',
        ['experience-1']
      )
    ).toBe(false);
    expect(
      isReviewableCopilotResult({ ...analysisResult, applicationStatus: 'applied' }, 'analysis', [
        'experience-1',
      ])
    ).toBe(false);
  });

  it('requires grounded draft segments for content operations and forbids them for analysis', () => {
    expect(
      isReviewableCopilotResult(
        {
          ...analysisResult,
          draftSegments: [
            {
              text: 'Auto-send me',
              sourceRefs: [{ kind: 'experience', id: 'experience-1', quote: 'Refonte Svelte' }],
            },
          ],
        },
        'analysis',
        ['experience-1']
      )
    ).toBe(false);
    expect(
      isReviewableCopilotResult(
        { ...analysisResult, kind: 'pitch', evidenceClaims: [] },
        'pitch',
        []
      )
    ).toBe(false);
    expect(
      isReviewableCopilotResult(
        {
          ...analysisResult,
          kind: 'pitch',
          evidenceClaims: [],
          draftSegments: [
            {
              text: 'Pitch à relire.',
              sourceRefs: [{ kind: 'experience', id: 'experience-1', quote: 'Refonte Svelte' }],
            },
          ],
        },
        'pitch',
        ['experience-1'],
        [],
        grounding
      )
    ).toBe(true);
  });

  it('rejects free-form summaries and invented artifact source references', () => {
    expect(
      isReviewableCopilotResult(
        { ...analysisResult, summary: 'Expérience inventée chez BigCo.' },
        'analysis',
        ['experience-1']
      )
    ).toBe(false);
    expect(
      isReviewableCopilotResult(
        {
          ...analysisResult,
          kind: 'pitch',
          draftSegments: [
            {
              text: 'J’ai dirigé BigCo.',
              sourceRefs: [{ kind: 'experience', id: 'invented', quote: 'BigCo' }],
            },
          ],
        },
        'pitch',
        ['experience-1'],
        [],
        grounding
      )
    ).toBe(false);
  });

  it.each([':', 'summary', 'S', 'Acme'])('rejects non-substantial source quote %s', (quote) => {
    expect(
      isReviewableCopilotResult(
        {
          ...analysisResult,
          kind: 'pitch',
          evidenceClaims: [],
          draftSegments: [
            {
              text: 'Pitch à relire.',
              sourceRefs: [{ kind: 'experience', id: 'experience-1', quote }],
            },
          ],
        },
        'pitch',
        ['experience-1'],
        [],
        grounding
      )
    ).toBe(false);
  });

  it('binds quotes to the exact selected field instead of any payload field', () => {
    expect(
      isReviewableCopilotResult(
        {
          ...analysisResult,
          kind: 'pitch',
          evidenceClaims: [],
          draftSegments: [
            {
              text: 'Pitch à relire.',
              sourceRefs: [
                { kind: 'mission-field', id: 'title', quote: 'Développeur frontend' },
                { kind: 'experience', id: 'experience-1', quote: 'Refonte Svelte' },
              ],
            },
          ],
        },
        'pitch',
        ['experience-1'],
        [],
        grounding
      )
    ).toBe(false);
  });

  it('exposes the same strict source-ref grounding boundary to every client', () => {
    expect(
      isCopilotSourceRefGrounded(
        { kind: 'experience', id: 'experience-1', quote: 'Refonte Svelte' },
        grounding,
        ['experience-1'],
        []
      )
    ).toBe(true);
    expect(
      isCopilotSourceRefGrounded(
        { kind: 'experience', id: 'experience-1', quote: 'summary' },
        grounding,
        ['experience-1'],
        []
      )
    ).toBe(false);
  });
});
