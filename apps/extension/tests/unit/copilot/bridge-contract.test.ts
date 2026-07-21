import { describe, expect, it } from 'vitest';

import {
  CopilotDossierProjectionSchema,
  CopilotTjmCoachFactsSchema,
  CopilotValidatedResultSchema,
} from '../../../src/lib/shell/copilot/validation';
import { validateMessage } from '../../../src/lib/shell/messaging/schemas';

const requestId = '11111111-1111-4111-8111-111111111111';

const validRequests = [
  { type: 'COPILOT_LINK', payload: { requestId } },
  { type: 'COPILOT_SYNC_ENTITLEMENT', payload: { requestId } },
  {
    type: 'COPILOT_CREATE_JOB',
    payload: {
      requestId,
      missionId: 'mission-1',
      kind: 'analysis',
      missionFields: ['title', 'description'],
      profileFields: ['jobTitle'],
      evidenceIds: [],
    },
  },
  { type: 'COPILOT_GET_DOSSIER', payload: { requestId, missionId: 'mission-1' } },
  { type: 'COPILOT_GET_JOB', payload: { requestId, missionId: 'mission-1' } },
  {
    type: 'COPILOT_CANCEL_JOB',
    payload: { requestId, missionId: 'mission-1', jobId: 'job-1' },
  },
  {
    type: 'COPILOT_REVIEW_JOB',
    payload: {
      requestId,
      missionId: 'mission-1',
      jobId: 'job-1',
      decision: 'accept',
    },
  },
  { type: 'COPILOT_DELETE_DOSSIER', payload: { requestId, missionId: 'mission-1' } },
] as const;

describe('Copilot bridge schemas', () => {
  it.each(validRequests)('strictly accepts $type', (message) => {
    expect(validateMessage(message)).toMatchObject({ valid: true, message });
    expect(validateMessage({ ...message, unexpected: true })).toMatchObject({ valid: false });
    expect(
      validateMessage({ ...message, payload: { ...message.payload, unexpected: true } })
    ).toMatchObject({ valid: false });
  });

  it('rejects unknown fields, duplicate selections and raw content in create', () => {
    const base = validRequests[2];
    expect(
      validateMessage({
        ...base,
        payload: { ...base.payload, missionFields: ['title', 'title'] },
      })
    ).toMatchObject({ valid: false });
    expect(
      validateMessage({
        ...base,
        payload: { ...base.payload, missionFields: ['url'] },
      })
    ).toMatchObject({ valid: false });
    expect(
      validateMessage({
        ...base,
        payload: { ...base.payload, profile: { fullCv: 'forbidden' } },
      })
    ).toMatchObject({ valid: false });
  });

  it('rejects malformed result unions instead of accepting unknown payloads', () => {
    expect(
      validateMessage({
        type: 'COPILOT_CREATE_JOB_RESULT',
        payload: {
          requestId,
          missionId: 'mission-1',
          outcome: 'ok',
          job: null,
          error: null,
        },
      })
    ).toMatchObject({ valid: false });
  });

  it('keeps the Zod TJM boundary in parity with the shared deterministic guard', () => {
    const validFacts = {
      schemaVersion: 1,
      confidence: 'medium',
      missionDisplayedTjm: 700,
      profileBounds: { min: 600, target: 700, max: 800, currency: 'EUR' },
      market: {
        matchedStacks: ['svelte'],
        recordCount: 2,
        sampleCount: 10,
        min: 600,
        weightedAverage: 720,
        max: 850,
        trend: 'up',
        lastObservedAt: '2026-07-20',
      },
    } as const;

    expect(CopilotTjmCoachFactsSchema.safeParse(validFacts).success).toBe(true);
    expect(
      CopilotTjmCoachFactsSchema.safeParse({ ...validFacts, confidence: 'high' }).success
    ).toBe(false);
    expect(
      CopilotTjmCoachFactsSchema.safeParse({
        ...validFacts,
        market: { ...validFacts.market, lastObservedAt: '20/07/2026' },
      }).success
    ).toBe(false);
    expect(
      CopilotTjmCoachFactsSchema.safeParse({
        ...validFacts,
        confidence: 'insufficient',
        market: { ...validFacts.market, recordCount: 0, sampleCount: 0 },
      }).success
    ).toBe(false);
  });

  it('rejects legacy free-form summary and draft output', () => {
    const analysis = {
      schemaVersion: 1,
      kind: 'analysis',
      evidenceClaims: [],
      gaps: [],
      risks: [],
      questions: [],
    } as const;
    expect(CopilotValidatedResultSchema.safeParse(analysis).success).toBe(true);
    expect(
      CopilotValidatedResultSchema.safeParse({ ...analysis, summary: 'Unverified free text' })
        .success
    ).toBe(false);
    expect(
      CopilotValidatedResultSchema.safeParse({ ...analysis, kind: 'pitch', draft: 'Legacy draft' })
        .success
    ).toBe(false);
  });

  it('accepts only approved public dossier content and rejects provider or unapproved fields', () => {
    const projection = {
      missionId: 'mission-1',
      state: 'ready',
      consent: { missionFields: ['title'], profileFields: [], evidenceIds: ['exp-1'] },
      analysis: {
        jobId: 'job-analysis',
        approvedAtMs: 1,
        result: {
          schemaVersion: 1,
          kind: 'analysis',
          evidenceClaims: [{ text: 'Preuve validée.', evidenceIds: ['exp-1'] }],
          gaps: [],
          risks: [],
          questions: [],
        },
      },
      approvedArtifacts: [
        {
          artifactId: 'artifact-1',
          jobId: 'job-pitch',
          kind: 'pitch',
          draft: 'Brouillon approuvé.',
          approvedAtMs: 2,
        },
      ],
      activeJob: null,
    };
    expect(CopilotDossierProjectionSchema.safeParse(projection).success).toBe(true);
    expect(
      CopilotDossierProjectionSchema.safeParse({
        ...projection,
        providerSessionId: 'forbidden',
      }).success
    ).toBe(false);
    expect(
      CopilotDossierProjectionSchema.safeParse({ ...projection, unapprovedResult: {} }).success
    ).toBe(false);
  });
});
